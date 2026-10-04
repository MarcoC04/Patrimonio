import { alertClass } from './styles';

/** Elenco dei campi da correggere, in un riquadro ben visibile (annunciato dagli screen reader). */
export function FormIssues({ messages }: { messages: readonly string[] }) {
  if (messages.length === 0) return null;
  return (
    <div role="alert" className={`${alertClass} mb-3`}>
      <ul className="list-disc pl-5">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}
