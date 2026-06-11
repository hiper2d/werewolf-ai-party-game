import Link from "next/link";

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

export default function DocFooter({ credit = false }: { credit?: boolean }) {
  return (
    <div className="doc-foot">
      <Link href="/" className="back-home">
        <ArrowLeftIcon />
        Back to Home
      </Link>
      {credit && <span className="credit">Created by hiper2d</span>}
    </div>
  );
}
