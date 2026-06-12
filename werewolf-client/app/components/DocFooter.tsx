import Link from "next/link";
import type { ReactNode } from "react";

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

export default function DocFooter({ credit = false, action }: { credit?: boolean; action?: ReactNode }) {
  return (
    <div className="doc-foot">
      <Link href="/" className="back-home">
        <ArrowLeftIcon />
        Back to Home
      </Link>
      {(credit || action) && (
        <div className="flex items-center gap-4 flex-wrap justify-end">
          {credit && <span className="credit">Created by hiper2d</span>}
          {action}
        </div>
      )}
    </div>
  );
}
