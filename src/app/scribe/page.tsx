import { redirect } from "next/navigation";
import { getAuthenticatedAppUser } from "@/lib/db/supabase-server";
import ScribeCockpit from "./ScribeCockpit";
import {scribeEntryTarget} from '@/lib/scribe-entry-target';

export const dynamic = "force-dynamic";

export default async function ScribePage({searchParams}:{searchParams:{entry?:string;patient?:string}}) {
  const user = await getAuthenticatedAppUser();
  if (!user) {const target=scribeEntryTarget(searchParams);redirect(target==='/scribe'?'/scribe/login':`/scribe/login${target.slice('/scribe'.length)}`);}
  return (
    <ScribeCockpit
      nutzerName={user.fullName ?? user.email ?? "Praxis"}
      nutzerKuerzel={user.kuerzel ?? null}
      initialEntry={searchParams.entry}
      initialPatient={searchParams.patient}
    />
  );
}
