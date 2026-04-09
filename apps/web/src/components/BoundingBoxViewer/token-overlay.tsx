"use client";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  TOKEN_COLOR,
  bboxToPercentStyle,
  colLabel,
  rowLabel,
} from "@/lib/marking/bounding-box";
import type { PageToken } from "@/lib/marking/types";

export function TokenOverlay({
  token,
  index,
}: {
  token: PageToken;
  index: number;
}) {
  const [yMin, xMin, yMax, xMax] = token.bbox;
  const displayText = token.text_corrected ?? token.text_raw;

  return (
    <Popover key={index}>
      <PopoverTrigger
        aria-label={`Word: ${displayText}`}
        style={{
          ...bboxToPercentStyle(token.bbox),
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      />

      <PopoverContent side="right" sideOffset={8} className="w-72">
        <PopoverHeader>
          <span
            className="inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
            style={{ backgroundColor: TOKEN_COLOR }}
          >
            Word
          </span>
          <PopoverTitle className="mt-2 font-mono text-sm leading-snug wrap-break-word">
            &ldquo;{displayText}&rdquo;
          </PopoverTitle>
        </PopoverHeader>

        <PopoverDescription className="rounded-md bg-blue-50 px-2.5 py-2 text-xs text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
          OCR read: &ldquo;{token.text_raw}&rdquo;
          {token.text_corrected &&
            token.text_corrected !== token.text_raw &&
            `(corrected to &ldquo;${token.text_corrected}&rdquo;)`}
        </PopoverDescription>

        <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Location</span>
            <span className="font-medium capitalize">
              {rowLabel(yMin)} {colLabel(xMin)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Coordinates</span>
            <span className="font-mono tabular-nums">
              y {yMin}–{yMax} · x {xMin}–{xMax}
            </span>
          </div>
          {token.confidence !== null && (
            <div className="flex items-center justify-between">
              <span>Confidence</span>
              <span className="font-mono tabular-nums">
                {Math.round((token.confidence ?? 0) * 100)}%
              </span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
