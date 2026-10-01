import { db } from "@/db/client";

export async function GET() {
  const data = db.$client.serialize();
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="finance-${stamp}.db"`,
    },
  });
}
