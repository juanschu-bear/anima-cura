import { redirect } from "next/navigation";
import { getAuthenticatedAppUser } from "@/lib/db/supabase-server";
import ScribeCockpit from "./ScribeCockpit";
import PracticeKnowledge from './PracticeKnowledge';
import reference from '@/lib/practice-reference.json';
import {canReadPracticeReference} from '@/lib/practice-reference';
import {t} from '@/lib/i18n';

export const dynamic = "force-dynamic";

export default async function ScribePage({searchParams}:{searchParams:{wissen?:string}}) {
  const user = await getAuthenticatedAppUser();
  if (!user) redirect("/scribe/login");
  if (searchParams.wissen) {
    if (!canReadPracticeReference(user)) return <main className='buehne'><p>{t('knowledge.denied')}</p></main>;
    const initial=searchParams.wissen==='rules'?'rules':searchParams.wissen==='questions'?'questions':'catalog';
    return <PracticeKnowledge data={reference} initial={initial}/>;
  }
  return (
    <ScribeCockpit
      nutzerName={user.fullName ?? user.email ?? "Praxis"}
      nutzerKuerzel={user.kuerzel ?? null}
    />
  );
}
