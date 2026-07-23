import { useState, useRef } from 'react';
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
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processImageMutation = trpc.comfyuiPoc.processImage.useMutation({
    onSuccess: (data) => {
      setResult({
        promptId: data.promptId,
        outputBase64: data.outputBase64,
      });
      toast.success('Image processed successfully!');
      setIsProcessing(false);
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
      setIsProcessing(false);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setResult(null);
    }
  };

  const handleProcessImage = async () => {
    if (!selectedFile) {
      toast.error('Please select an image first');
      return;
    }

    setIsProcessing(true);

    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64String = (e.target?.result as string).split(',')[1];
        processImageMutation.mutate({
          imageBase64: base64String,
          imageName: selectedFile.name,
          positivePrompt: positivePrompt || undefined,
        });
      };
      reader.readAsDataURL(selectedFile);
    } catch (error) {
      toast.error('Failed to read file');
      setIsProcessing(false);
    }
  };

  const downloadResult = () => {
    if (!result) return;

    const link = document.createElement('a');
    link.href = `data:image/jpeg;base64,${result.outputBase64}`;
    link.download = `comfyui-output-${result.promptId}.jpg`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">ComfyUI POC</h1>
          <p className="text-slate-400">Test image upload and processing with local ComfyUI instance</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upload Section */}
          <Card className="bg-slate-800 border-slate-700">
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

              {/* Status */}
              {isProcessing && (
                <div className="bg-slate-700 rounded-lg p-4">
                  <p className="text-slate-300 text-sm">
                    Processing image with ComfyUI... This may take a minute.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Result Section */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Result</CardTitle>
              <CardDescription>Processed image output</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {result ? (
                <>
                  <div className="bg-slate-700 rounded-lg p-4">
                    <img
                      src={`data:image/jpeg;base64,${result.outputBase64}`}
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
        </div>

        {/* Info Section */}
        <Card className="bg-slate-800 border-slate-700 mt-6">
          <CardHeader>
            <CardTitle className="text-white">POC Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-slate-300 text-sm">
            <div>
              <p className="font-semibold text-white mb-1">ComfyUI Instance:</p>
              <p>http://oscarngan.ddns.net:8188</p>
            </div>
            <div>
              <p className="font-semibold text-white mb-1">Workflow:</p>
              <p>QwenImageEditRapidv1.0(External)</p>
            </div>
            <div>
              <p className="font-semibold text-white mb-1">Process:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Upload image to temporary directory</li>
                <li>Build Qwen workflow JSON</li>
                <li>Submit to ComfyUI /prompt endpoint</li>
                <li>Poll /history endpoint for results</li>
                <li>Download processed image</li>
                <li>Return result to frontend</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
