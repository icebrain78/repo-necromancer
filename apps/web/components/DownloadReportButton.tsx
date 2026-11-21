'use client';

/**
 * DownloadReportButton – client component.
 *
 * Receives the serialised AutopsyReport as a string prop and triggers a
 * client-side JSON file download via a Blob URL on click.
 *
 * REQ-A8.4, REQ-A9.4
 */

interface DownloadReportButtonProps {
  reportJson: string;
  owner: string;
  name: string;
}

export function DownloadReportButton({ reportJson, owner, name }: DownloadReportButtonProps) {
  function handleDownload() {
    const blob = new Blob([reportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${owner}-${name}-autopsy.json`;
    anchor.click();

    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleDownload}
      aria-label="Download autopsy report as JSON"
      className="px-4 py-2 bg-stone-700 hover:bg-stone-600 text-stone-100 rounded transition-colors"
    >
      Download report (JSON)
    </button>
  );
}
