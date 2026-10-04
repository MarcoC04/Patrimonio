import { strings } from './strings';

/**
 * Gli stessi dati di un grafico, in tabella: per chi non vede i grafici e per controllare i
 * valori esatti. Chiusa di default, così non pesa sullo schermo.
 */
export function DataTable({
  headers,
  rows,
}: {
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}) {
  return (
    <details className="mt-2">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-fg">
        {strings.dashboard.table.showData}
      </summary>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              {headers.map((header, index) => (
                <th
                  key={header}
                  scope="col"
                  className={`py-1 font-medium ${index > 0 ? 'text-right' : ''}`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="border-t border-line-soft">
                {row.map((cell, index) => (
                  <td
                    key={`${row[0]}-${index}`}
                    className={`py-1 ${index > 0 ? 'text-right' : ''}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
