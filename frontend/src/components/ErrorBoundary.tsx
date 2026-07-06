import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-md p-8 text-center">
          <h2 className="text-lg font-semibold mb-2">页面出错了</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {this.state.error.message}
          </p>
          <Button onClick={() => location.reload()}>刷新页面</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
