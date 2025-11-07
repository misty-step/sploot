"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";

export default function TestShadcnBatch4Page() {
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Simulate progress
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 0;
        return prev + 10;
      });
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="container mx-auto p-8 space-y-8">
      <h1 className="text-3xl font-bold">shadcn/ui Batch 4 Components Test</h1>

      {/* Skeleton */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Skeleton</h2>
        <div className="space-y-4">
          {loading ? (
            <Card className="max-w-md">
              <CardHeader>
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ) : (
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle>Content Loaded</CardTitle>
                <CardDescription>This content appeared after 2 seconds</CardDescription>
              </CardHeader>
              <CardContent>
                <p>Skeleton loaders are used to indicate loading states.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Alert variants */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Alert</h2>
        <div className="space-y-4 max-w-2xl">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Info</AlertTitle>
            <AlertDescription>
              This is an informational alert message.
            </AlertDescription>
          </Alert>

          <Alert variant="default">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>
              Your action completed successfully.
            </AlertDescription>
          </Alert>

          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Something went wrong. Please try again.
            </AlertDescription>
          </Alert>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              This action cannot be undone.
            </AlertDescription>
          </Alert>
        </div>
      </section>

      {/* Progress */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Progress</h2>
        <div className="space-y-4 max-w-md">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Animated Progress</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Static Progress (33%)</span>
              <span>33%</span>
            </div>
            <Progress value={33} />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Static Progress (66%)</span>
              <span>66%</span>
            </div>
            <Progress value={66} />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Complete (100%)</span>
              <span>100%</span>
            </div>
            <Progress value={100} />
          </div>
        </div>
      </section>

      {/* Note about Toast */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Toast</h2>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Toast Component</CardTitle>
            <CardDescription>
              Toast component already exists in the codebase
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The custom toast component at components/ui/toast.tsx will be replaced
              with shadcn&apos;s Sonner integration during Phase 4 of the migration.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
