import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import type { ChiusuraCassa } from '@sagra-mazzocco/shared';
import { useChiusure, useOrdini, useOrdiniBanco } from '../hooks';
import { arrotonda, incassoDiSerata, scartoDiCassa, type Punto } from '../services/conti';
import { db } from '../services/firebase';
import { euro, euroConSegno, importoDaTesto } from '../services/formato';

/** Il conteggio di fine serata, cassetto per cassetto.
 *
 * È la schermata che si usa tutte le sere, ed è quella che scopre gli errori:
 * un cassetto che non torna vuol dire un ordine battuto male, un resto
 * sbagliato o un pagamento segnato col metodo che non era. Un cassetto che
 * torna al centesimo tutte le sere è raro; quello che conta è vedere dove non
 * torna e di quanto. */
function RigaCassetto({
  serataId,
  punto,
  chiusura,
  nome,
}: {
  serataId: string;
  punto: Punto;
  chiusura: ChiusuraCassa | undefined;
  nome: string;
}) {
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function salva(campi: Partial<ChiusuraCassa>) {
    setInCorso(true);
    setErrore(null);
    try {
      const documento: ChiusuraCassa = {
        id: punto.id,
        serataId,
        puntoId: punto.id,
        fondoCassa: chiusura?.fondoCassa ?? 0,
        contatoContanti: chiusura?.contatoContanti ?? 0,
        contatoElettronico: chiusura?.contatoElettronico ?? 0,
        note: chiusura?.note ?? '',
        ...campi,
        aggiornatoAt: serverTimestamp() as unknown as ChiusuraCassa['aggiornatoAt'],
        aggiornatoDa: nome,
      };
      await setDoc(doc(db, `serate/${serataId}/chiusure`, punto.id), documento);
    } catch (err) {
      setErrore((err as Error).message);
    } finally {
      setInCorso(false);
    }
  }

  /** Le caselle si salvano quando si esce dal campo, non a ogni tasto: si
   * scrive "1", "12", "125" e non ha senso salvare tre volte. */
  function salvaImporto(campo: 'fondoCassa' | 'contatoContanti' | 'contatoElettronico') {
    return (e: React.FocusEvent<HTMLInputElement>) => {
      const valore = importoDaTesto(e.target.value);
      if (valore === null) {
        e.target.value = String(chiusura?.[campo] ?? 0).replace('.', ',');
        setErrore('Importo non valido: scrivi per esempio 125,50.');
        return;
      }
      if (valore !== (chiusura?.[campo] ?? 0)) salva({ [campo]: valore });
    };
  }

  const scarto = scartoDiCassa(punto, chiusura);
  const attesoContanti = arrotonda(punto.contanti + (chiusura?.fondoCassa ?? 0));

  return (
    <section className="riquadro cassetto">
      <div className="testata-cassetto">
        <h2>{punto.nome}</h2>
        <span className="atteso">
          L'app dice: contanti <strong>{euro(punto.contanti)}</strong> · POS <strong>{euro(punto.elettronico)}</strong>
        </span>
      </div>

      <div className="campi-cassetto">
        <label>
          Fondo cassa iniziale
          <input
            type="text"
            inputMode="decimal"
            defaultValue={String(chiusura?.fondoCassa ?? 0).replace('.', ',')}
            disabled={inCorso}
            onBlur={salvaImporto('fondoCassa')}
            aria-label={`Fondo cassa di ${punto.nome}`}
          />
          <small>Non è incasso: si ritrova nel cassetto a fine serata</small>
        </label>
        <label>
          Contato nel cassetto
          <input
            type="text"
            inputMode="decimal"
            defaultValue={String(chiusura?.contatoContanti ?? 0).replace('.', ',')}
            disabled={inCorso}
            onBlur={salvaImporto('contatoContanti')}
            aria-label={`Contanti contati in ${punto.nome}`}
          />
          <small>Fondo compreso: dovrebbe fare {euro(attesoContanti)}</small>
        </label>
        <label>
          Letto dal POS
          <input
            type="text"
            inputMode="decimal"
            defaultValue={String(chiusura?.contatoElettronico ?? 0).replace('.', ',')}
            disabled={inCorso}
            onBlur={salvaImporto('contatoElettronico')}
            aria-label={`POS letto in ${punto.nome}`}
          />
          <small>Il totale della giornata sul terminale</small>
        </label>
      </div>

      <div className="scarti">
        <span className={`scarto ${scarto.daContare ? 'assente' : scarto.contanti === 0 ? 'giusto' : 'storto'}`}>
          Differenza contanti <strong>{scarto.daContare ? '—' : euroConSegno(scarto.contanti)}</strong>
        </span>
        <span className={`scarto ${scarto.daContare ? 'assente' : scarto.elettronico === 0 ? 'giusto' : 'storto'}`}>
          Differenza POS <strong>{scarto.daContare ? '—' : euroConSegno(scarto.elettronico)}</strong>
        </span>
      </div>

      <label className="note-cassetto">
        Note
        <input
          type="text"
          placeholder="es. mancano 4 € , sbagliato un resto"
          defaultValue={chiusura?.note ?? ''}
          disabled={inCorso}
          onBlur={(e) => e.target.value !== (chiusura?.note ?? '') && salva({ note: e.target.value })}
          aria-label={`Note su ${punto.nome}`}
        />
      </label>

      {errore && <p className="errore">{errore}</p>}
    </section>
  );
}

export function Chiusura({ serataId, nome }: { serataId: string | null; nome: string }) {
  const ordini = useOrdini(serataId);
  const ordiniBanco = useOrdiniBanco(serataId);
  const { chiusure, caricate } = useChiusure(serataId);

  if (!serataId) return null;

  const incasso = incassoDiSerata(ordini, ordiniBanco);
  const scarti = incasso.punti.map((punto) => scartoDiCassa(punto, chiusure.get(punto.id)));
  const daContare = scarti.filter((s) => s.daContare).length;
  const totaleScarto = arrotonda(
    scarti.filter((s) => !s.daContare).reduce((somma, s) => somma + s.contanti + s.elettronico, 0)
  );

  return (
    <div className="chiusura">
      <section className="riquadro riepilogo-chiusura">
        <h2>Chiusura della serata</h2>
        <p className="spiegazione">
          Un cassetto per volta: si scrive quanto c'era dentro e quanto dice il POS, e la differenza si calcola da
          sé. I numeri si salvano da soli appena esci dalla casella.
        </p>
        <p className={`totale-scarto ${daContare > 0 ? 'assente' : totaleScarto === 0 ? 'giusto' : 'storto'}`}>
          {daContare > 0
            ? `${daContare} ${daContare === 1 ? 'cassetto ancora da contare' : 'cassetti ancora da contare'}`
            : `Differenza totale della serata: ${euroConSegno(totaleScarto)}`}
        </p>
      </section>

      {!caricate ? (
        <p className="vuoto">Un attimo…</p>
      ) : incasso.punti.length === 0 ? (
        <p className="vuoto">Questa serata non ha incassi: non c'è niente da contare.</p>
      ) : (
        incasso.punti.map((punto) => (
          <RigaCassetto
            key={punto.id}
            serataId={serataId}
            punto={punto}
            chiusura={chiusure.get(punto.id)}
            nome={nome}
          />
        ))
      )}
    </div>
  );
}
