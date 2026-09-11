import React, { Component, ReactNode } from 'react';

export class ErrorBoundary extends Component<{children: ReactNode, resetKey?: any}, {hasError: boolean}> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any) { console.error(error); }
  render() {
    if (this.state.hasError) return <div className="p-4 text-destructive">An error occurred.</div>;
    return this.props.children;
  }
}
