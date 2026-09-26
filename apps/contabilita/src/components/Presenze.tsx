import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { pesoPresenza, type Presenza } from '@sagra-mazzocco/shared';
import { useOrdini, useOrdiniBanco, usePresenze, useUtenti } from '../hooks';
import { incassoDiSerata, rendimentoVolontari } from '../services/conti';
import { db } from '../services/firebase';
import { euro } from '../services/formato';

/** Chi c'era a lavorare, sera per sera.
 *
 * Una spunta e nient'altro. Gli orari di entrata e uscita sarebbero più
 * precisi e non li compilerebbe nessuno: alla sagra si corre, e un modulo che
 * chiede troppo resta vuoto. "Mezza serata" è l'unica sfumatura, e serve
 * perché chi arriva alle dieci non ha fatto la stessa sera di chi c'è da
 * mezzogiorno.
 *
 * Il numero che ne esce — quanto ha reso la serata per volontario — va letto
 * per quello che è: non misura quanto lavora una persona, misura quante
 * persone servono per fare quell'incasso. */
export function Presenze({ serataId }: { serataId: string | null }) {
  const utenti = useUtenti();
  const presenze = usePresenze(serataId);
  const ordini = useOrdini(serataId);
  const ordiniBanco = useOrdiniBanco(serataId);
  const [errore, setErrore] = useState<string | null>(null);
  /** Le spunte appena date, prima che il server risponda.
   *
   * Senza, si tocca la casella e non succede niente per un secondo: la casella
   * è comandata da quello che c'è in archivio, e finché l'archivio non
   * risponde torna com'era. Chi sta spuntando venti volontari di fila la
   * ritocca convinto di aver sbagliato mira, e la rimette a zero. */
  const [locali, setLocali] = useState<Record<string, { presente: boolean; meta: boolean }>>({});

  if (!serataId) return null;

  const incasso = incassoDiSerata(ordini, ordiniBanco);
  const viste = utenti.map((utente) => ({
    uid: utente.uid,
    serataId: serataId!,
    nome: utente.nome,
    ...statoDi(utente.uid),
    aggiornatoAt: { seconds: 0, nanoseconds: 0 },
  }));
  const resa = rendimentoVolontari(incasso.totale, incasso.coperti, viste);

  /** Quello che si vede: l'archivio, coperto dalle spunte appena date. */
  function statoDi(uid: string): { presente: boolean; meta: boolean } {
    const salvata = presenze.get(uid);
    return locali[uid] ?? { presente: salvata?.presente ?? false, meta: salvata?.meta ?? false };
  }

  async function segna(uid: string, nome: string, campi: Partial<Presenza>) {
    const attuale = statoDi(uid);
    const presenza: Presenza = {
      uid,
      serataId: serataId!,
      nome,
      presente: attuale.presente,
      meta: attuale.meta,
      ...campi,
      aggiornatoAt: serverTimestamp() as unknown as Presenza['aggiornatoAt'],
    };
    setLocali((prec) => ({ ...prec, [uid]: { presente: presenza.presente, meta: presenza.meta } }));
    try {
      await setDoc(doc(db, `serate/${serataId}/presenze`, uid), presenza);
      setErrore(null);
    } catch (err) {
      setErrore((err as Error).message);
    }
  }

  return (
    <div className="presenze">
      <div className="riga-quadrati">
        <section className="quadrato quadrato-conteggio">
          <h3>Volontari presenti</h3>
          <p className="valore-quadrato">{resa.presenti}</p>
          <p className="spiegazione">{resa.peso} serate piene, contando le mezze</p>
        </section>
        <section className="quadrato quadrato-incasso">
          <h3>Resa per volontario</h3>
          <p className="valore-quadrato">{resa.peso === 0 ? '—' : euro(resa.incassoPerVolontario)}</p>
          <p className="spiegazione">Incasso della serata diviso le presenze</p>
        </section>
        <section className="quadrato quadrato-conteggio">
          <h3>Coperti per volontario</h3>
          <p className="valore-quadrato">{resa.peso === 0 ? '—' : String(resa.copertiPerVolontario)}</p>
          <p className="spiegazione">Persone servite a testa</p>
        </section>
      </div>

      <section className="riquadro">
        <h2>Chi c'era</h2>
        <p className="spiegazione">
          Si spunta a fine serata, in due minuti. <strong>Mezza serata</strong> per chi è arrivato tardi o è andato
          via presto: pesa la metà nel conto qui sopra.
        </p>

        {errore && <p className="errore">{errore}</p>}

        {utenti.length === 0 ? (
          <p className="vuoto">Nessun volontario con un account. Si creano nell'app Utenti.</p>
        ) : (
          <table className="tabella-conti tabella-presenze">
            <thead>
              <tr>
                <th>Volontario</th>
                <th className="centro">C'era</th>
                <th className="centro">Mezza serata</th>
              </tr>
            </thead>
            <tbody>
              {utenti.map((utente) => {
                const presenza = statoDi(utente.uid);
                const presente = presenza.presente;
                return (
                  <tr key={utente.uid} className={presente ? 'presente' : undefined}>
                    <td>
                      {utente.nome}
                      <small> · {utente.nomeUtente}</small>
                    </td>
                    <td className="centro">
                      <input
                        type="checkbox"
                        checked={presente}
                        aria-label={`Presente: ${utente.nome}`}
                        onChange={(e) => segna(utente.uid, utente.nome, { presente: e.target.checked })}
                      />
                    </td>
                    <td className="centro">
                      <input
                        type="checkbox"
                        checked={presenza.meta}
                        disabled={!presente}
                        aria-label={`Mezza serata: ${utente.nome}`}
                        onChange={(e) => segna(utente.uid, utente.nome, { meta: e.target.checked })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Totale</td>
                <td className="centro">
                  <strong>{resa.presenti}</strong>
                </td>
                <td className="centro">
                  <strong>{viste.filter((p) => p.presente && p.meta).length}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
        <p className="spiegazione">
          Una presenza intera pesa {pesoPresenza({ presente: true, meta: false })}, una mezza{' '}
          {pesoPresenza({ presente: true, meta: true })}.
        </p>
      </section>
    </div>
  );
}
