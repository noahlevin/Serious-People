import { useState, useRef, useCallback } from 'react';

interface StreamingMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface UseStreamingChatOptions {
  onComplete?: (data: any) => void;
  onError?: (error: string) => void;
  onToolExecuted?: () => void;
}

interface StreamEvent {
  type: 'text_delta' | 'tool_executed' | 'done' | 'error';
  content?: string;
  toolName?: string;
  eventType?: string;
  refetchEvents?: boolean;
  error?: string;
  [key: string]: any;
}

export function useStreamingChat(options: UseStreamingChatOptions = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const sendMessage = useCallback(async (
    message: string,
    endpoint: string = '/api/interview/turn/stream'
  ) => {
    cleanup();

    setIsStreaming(true);
    setStreamingContent('');

    try {
      // Create abort controller for fetch
      abortControllerRef.current = new AbortController();

      // Make POST request to initiate stream
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for auth
        body: JSON.stringify({ message }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      // Read the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = ''; // Buffer for incomplete lines

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // Decode the chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines (SSE events end with \n\n)
        const lines = buffer.split('\n');

        // Keep the last incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonString = line.substring(6).trim();
              if (!jsonString) continue; // Skip empty data lines

              const data: StreamEvent = JSON.parse(jsonString);

              console.log('[StreamingChat] Received event:', data.type);

              if (data.type === 'text_delta' && data.content) {
                // Accumulate streaming text
                setStreamingContent(prev => prev + data.content);
              } else if (data.type === 'tool_executed') {
                // Tool was executed - notify parent to refetch events
                console.log('[StreamingChat] Tool executed:', data.toolName);
                if (data.refetchEvents && options.onToolExecuted) {
                  options.onToolExecuted();
                }
              } else if (data.type === 'done') {
                // Stream complete
                console.log('[StreamingChat] Stream complete');
                setIsStreaming(false);
                if (options.onComplete) {
                  options.onComplete(data);
                }
                cleanup();
                return;
              } else if (data.type === 'error') {
                // Error occurred
                console.error('[StreamingChat] Error event:', data.error);
                setIsStreaming(false);
                if (options.onError) {
                  options.onError(data.error || 'Unknown error');
                }
                cleanup();
                return;
              }
            } catch (e) {
              console.error('[StreamingChat] Failed to parse SSE data:', e, 'Line:', line);
            }
          }
        }
      }

      // Stream ended without 'done' event
      console.warn('[StreamingChat] Stream ended without done event');
      setIsStreaming(false);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[StreamingChat] Stream aborted');
      } else {
        console.error('[StreamingChat] Streaming error:', error);
        if (options.onError) {
          options.onError(error.message || 'Failed to stream message');
        }
      }
      setIsStreaming(false);
      cleanup();
    }
  }, [cleanup, options]);

  const cancelStream = useCallback(() => {
    cleanup();
    setIsStreaming(false);
    setStreamingContent('');
  }, [cleanup]);

  return {
    isStreaming,
    streamingContent,
    sendMessage,
    cancelStream,
  };
}
