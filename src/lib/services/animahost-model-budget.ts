import {ModelAccessError} from './animahost-model-access';

/**
 * Tagesgrenze für Testläufe (Juan, 25.11.2026): höchstens 2 USD pro Kalendertag in Berlin, auch bei parallelen Aufrufen.
 * Jeder Testaufruf reserviert vor dem Senden seine Kostenobergrenze in der Datenbank (atomar, Migration 107) und rechnet danach
 * die tatsächlichen Kosten ab. Reicht der Rest nicht, wird nicht gesendet. Ohne Grenze laufen keine Tests (fail closed).
 * Live-Antworten an Patienten sind davon nie betroffen.
 */
export const TEST_BUDGET_USD_PER_DAY=2;

export function budgetDay(now=new Date()):string{
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}

export type Reservation={day:string;amountUsd:number};

/**
 * Reserviert die Obergrenze eines Testaufrufs. Bis Migration 107 (Tagesbudget in der Datenbank) freigegeben und eingespielt ist,
 * laufen keine Testaufrufe: test_budget_not_ready. So kann vorher nichts unbegrenzt über den Test-Schlüssel laufen.
 */
export async function reserveTestBudget(amountUsd:number,now=new Date()):Promise<Reservation>{
 void amountUsd;void now;
 throw new ModelAccessError('test_budget_not_ready');
}

/** Abrechnung folgt mit Migration 107. */
export async function settleTestBudget(reservation:Reservation,actualUsd:number|null):Promise<void>{void reservation;void actualUsd;}
