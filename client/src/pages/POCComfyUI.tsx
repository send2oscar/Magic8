import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

export function POCComfyUI() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [positivePrompt, setPositivePrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{
    promptId: string;
    outputBase64: string;
    outputMimeType: string;
  } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const addServerDiagnostics = (diagnostics: Array<{ label: string; detail?: string }>) => {
    diagnostics.forEach((entry) => addLog(`${entry.label}${entry.detail ? ` (${entry.detail})` : ''}`));
  };

  const processImageMutation = trpc.comfyuiPoc.processImage.useMutation({
    onSuccess: (data) => {
      addServerDiagnostics(data.diagnostics);
      if (!data.success) {
        addLog(`❌ ${data.message}`);
        toast.error(data.message);
        setIsProcessing(false);
        return;
      }
      setResult({
        promptId: data.promptId,
        outputBase64: data.outputBase64,
        outputMimeType: data.outputMimeType,
      });
      addLog('✅ ComfyUI POC completed successfully.');
      toast.success('ComfyUI POC completed successfully.');
      setIsProcessing(false);
    },
    onError: (error) => {
      addLog(`❌ Error: ${error.message}`);
      toast.error(`Error: ${error.message}`);
      setIsProcessing(false);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setResult(null);
      setLogs([]);
      addLog(`📁 Selected file: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
    }
  };

  const handleProcessImage = async () => {
    if (!selectedFile) {
      toast.error('Please select an image first');
      return;
    }

    setIsProcessing(true);
    setLogs([]);
    addLog('Starting ComfyUI POC request.');
    addLog(`Preparing selected image: ${selectedFile.name}`);

    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64String = (e.target?.result as string).split(',')[1];
        if (!base64String) {
          addLog('❌ The selected file could not be encoded.');
          setIsProcessing(false);
          return;
        }
        addLog('Sending the image to the application server.');
        processImageMutation.mutate({
          imageBase64: base64String,
          imageName: selectedFile.name,
          positivePrompt: positivePrompt || undefined,
        });
      };
      reader.readAsDataURL(selectedFile);
    } catch (error) {
      addLog(`❌ Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      toast.error('Failed to read file');
      setIsProcessing(false);
    }
  };

  const downloadResult = () => {
    if (!result) return;

    const link = document.createElement('a');
    link.href = `data:${result.outputMimeType};base64,${result.outputBase64}`;
    const extension = result.outputMimeType === 'image/png' ? 'png' : result.outputMimeType === 'image/webp' ? 'webp' : 'jpg';
    link.download = `comfyui-output-${result.promptId}.${extension}`;
    link.click();
    addLog('💾 Result downloaded');
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('📋 Logs cleared');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">ComfyUI POC</h1>
          <p className="text-slate-400">Test a remote image upload, Qwen edit request, and result download.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload Section */}
          <Card className="bg-slate-800 border-slate-700 lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-white">Upload Image</CardTitle>
              <CardDescription>Select an image to process with Qwen workflow</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* File Input */}
              <div>
                <Label className="text-slate-200">Select Image</Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  disabled={isProcessing}
                  className="bg-slate-700 border-slate-600 text-white"
                />
                {selectedFile && (
                  <p className="text-sm text-slate-400 mt-2">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                  </p>
                )}
              </div>

              {/* Positive Prompt */}
              <div>
                <Label className="text-slate-200">Positive Prompt (Optional)</Label>
                <Textarea
                  value={positivePrompt}
                  onChange={(e) => setPositivePrompt(e.target.value)}
                  placeholder="Enter positive prompt for image editing..."
                  disabled={isProcessing}
                  className="bg-slate-700 border-slate-600 text-white resize-none"
                  rows={4}
                />
              </div>

              {/* Process Button */}
              <Button
                onClick={handleProcessImage}
                disabled={!selectedFile || isProcessing}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isProcessing ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Processing...
                  </>
                ) : (
                  'Process Image'
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Result Section */}
          <Card className="bg-slate-800 border-slate-700 lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-white">Result</CardTitle>
              <CardDescription>Processed image output</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {result ? (
                <>
                  <div className="bg-slate-700 rounded-lg p-4">
                    <img
                      src={`data:${result.outputMimeType};base64,${result.outputBase64}`}
                      alt="Processed result"
                      className="w-full rounded-lg"
                    />
                  </div>

                  <div className="bg-slate-700 rounded-lg p-3">
                    <p className="text-sm text-slate-300">
                      <span className="font-semibold">Prompt ID:</span> {result.promptId}
                    </p>
                  </div>

                  <Button
                    onClick={downloadResult}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                  >
                    Download Result
                  </Button>

                  <Button
                    onClick={() => {
                      setResult(null);
                      setSelectedFile(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                      }
                      setLogs([]);
                    }}
                    variant="outline"
                    className="w-full text-slate-300 border-slate-600 hover:bg-slate-700"
                  >
                    Process Another Image
                  </Button>
                </>
              ) : (
                <div className="bg-slate-700 rounded-lg p-8 text-center">
                  <p className="text-slate-400">No result yet. Upload and process an image to see results here.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Live Logs Section */}
          <Card className="bg-slate-800 border-slate-700 lg:col-span-1">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-white">Processing Log</CardTitle>
                  <CardDescription>Safe server-side diagnostics returned for this POC request</CardDescription>
                </div>
                <Button
                  onClick={clearLogs}
                  size="sm"
                  variant="outline"
                  className="text-slate-300 border-slate-600 hover:bg-slate-700"
                >
                  Clear
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-xs text-slate-300 border border-slate-700">
                {logs.length === 0 ? (
                  <p className="text-slate-500">Logs will appear here...</p>
                ) : (
                  logs.map((log, idx) => (
                    <div key={idx} className="mb-1 text-slate-400">
                      {log}
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info Section */}
        <Card className="bg-slate-800 border-slate-700 mt-6">
          <CardHeader>
            <CardTitle className="text-white">POC Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-slate-300 text-sm">
            <div>
              <p className="font-semibold text-white mb-1">ComfyUI Instance:</p>
              <p>Remote ComfyUI instance (connected server-to-server)</p>
            </div>
            <div>
              <p className="font-semibold text-white mb-1">Workflow:</p>
              <p>QwenImageEditRapidv1.0(External)</p>
            </div>
            <div>
              <p className="font-semibold text-white mb-1">Process:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Upload the source image to ComfyUI’s input directory</li>
                <li>Insert ComfyUI’s returned filename into Qwen workflow node 78</li>
                <li>Submit the fixed Qwen workflow to the prompt endpoint</li>
                <li>Poll the history endpoint until the job completes</li>
                <li>Download the named output image and return it to this page</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
