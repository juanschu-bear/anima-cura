import {createServerComponentClient} from '@/lib/db/supabase-server';
import {createServerClient} from '@/lib/db/supabase';
import {practiceAppAccessHandler} from '@/lib/practice-app-access-api';
export const dynamic='force-dynamic';export const maxDuration=60;
const handler=practiceAppAccessHandler(createServerComponentClient,()=>createServerClient({noStore:true}));
export const GET=handler;export const POST=handler;
