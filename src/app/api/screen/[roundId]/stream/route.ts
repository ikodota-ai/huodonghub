import { subscribe, screenChannel } from "@/lib/sse";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { roundId: string } }) {
  const channel = screenChannel(params.roundId);
  const encoder = new TextEncoder();
  let unsubscribe: () => void;
  let heartbeat: NodeJS.Timeout;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send("hello", { at: Date.now() });
      unsubscribe = subscribe(channel, send);
      heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch {}
      }, 15000);
    },
    cancel() {
      clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
