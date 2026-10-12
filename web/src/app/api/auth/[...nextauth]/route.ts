import NextAuth from "next-auth";
import { authEnabled, authOptions } from "@/lib/auth/config";

const handler = NextAuth(authOptions);

async function guarded(request: Request, context: { params: Promise<{ nextauth: string[] }> }) {
  if (!authEnabled()) return new Response(null, { status: 404 });
  return handler(request, context);
}

export { guarded as GET, guarded as POST };
