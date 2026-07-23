import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import React, { useState, useEffect } from 'react';

import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Gallery from "./pages/Gallery";
import AdminLogin from "./pages/AdminLogin";
import AdminPanel from "./pages/AdminPanel";
import Login from "./pages/Login";
import Register from "./pages/Register";
import { POCComfyUI } from "./pages/POCComfyUI";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/login"} component={Login} />
      <Route path={"/register"} component={Register} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/gallery"} component={Gallery} />
      <Route path={"admin/login"} component={AdminLogin} />
      <Route path={"admin"} component={AdminPanel} />
      <Route path={"poc/comfyui"} component={POCComfyUI} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  const [versionInfo, setVersionInfo] = useState<{ version: number; checkpointId: string } | null>(null);

  useEffect(() => {
    fetch('/versions.json')
      .then(response => response.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setVersionInfo(data[data.length - 1]);
        }
      })
      .catch(error => console.error('Failed to load version info:', error));
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
        {versionInfo && (
          <footer className="text-center text-xs text-gray-500 py-4">
            Version: {versionInfo.version} ({versionInfo.checkpointId.substring(0, 7)})
          </footer>
        )}
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
