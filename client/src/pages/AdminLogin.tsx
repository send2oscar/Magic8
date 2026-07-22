import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { CircleAlert, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const session = trpc.admin.session.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const login = trpc.admin.login.useMutation({ onSuccess: async () => { await utils.admin.session.invalidate(); setLocation("/admin"); } });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  useEffect(() => { if (session.data?.authenticated) setLocation("/admin"); }, [session.data?.authenticated, setLocation]);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); await login.mutateAsync({ username, password }); };

  return <div className="flex min-h-screen items-center justify-center bg-background px-4"><Card className="hud-frame w-full max-w-md bg-card/60 p-7"><div className="mb-7 text-center"><ShieldCheck className="mx-auto mb-4 h-10 w-10 text-accent" /><h1 className="text-3xl font-bold neon-pink">ADMIN ACCESS</h1><p className="mt-3 text-sm text-muted-foreground">Dedicated credentials are required to review private user data.</p></div>{!session.isLoading && !session.data?.configured ? <div className="rounded border border-destructive/60 bg-destructive/10 p-4 text-sm text-destructive">Administrator credentials have not been configured yet.</div> : <form className="space-y-5" onSubmit={submit}><label className="block space-y-2"><span className="text-sm font-bold">ADMIN USERNAME</span><Input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required disabled={login.isPending} /></label><label className="block space-y-2"><span className="text-sm font-bold">ADMIN PASSWORD</span><Input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required disabled={login.isPending} /></label>{login.isError ? <p className="flex items-center gap-2 text-sm text-destructive"><CircleAlert className="h-4 w-4" /> Invalid administrator credentials.</p> : null}<Button type="submit" disabled={login.isPending || session.isLoading} className="w-full bg-secondary text-background font-bold">{login.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <LockKeyhole className="mr-2 h-4 w-4" />}{login.isPending ? "VERIFYING..." : "SIGN IN AS ADMIN"}</Button></form>}</Card></div>;
}
