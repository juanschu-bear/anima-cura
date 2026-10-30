import { redirect } from "next/navigation";
import { getAuthenticatedAppUser } from "@/lib/db/supabase-server";
import ScribeLogin from "../ScribeLogin";
import {scribeEntryTarget} from '@/lib/scribe-entry-target';

export const dynamic = "force-dynamic";

export default async function ScribeLoginPage({searchParams}:{searchParams:{entry?:string;patient?:string}}) {
  const destination=scribeEntryTarget(searchParams);
  const user = await getAuthenticatedAppUser();
  if (user) redirect(destination);
  return <ScribeLogin destination={destination}/>;
}
