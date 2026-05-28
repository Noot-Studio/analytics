import { Button } from "@sbox-analytics/ui/components/button";
import { Input } from "@sbox-analytics/ui/components/input";
import { Label } from "@sbox-analytics/ui/components/label";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

interface CopyFieldProps {
  label: string;
  value: string;
}

function CopyField({ label, value }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" />
        <Button
          onClick={handleCopy}
          size="icon"
          type="button"
          variant="outline"
        >
          {copied ? (
            <CheckIcon className="size-4" />
          ) : (
            <CopyIcon className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

interface SecretRevealProps {
  publishableKey: string;
  secretKey: string;
}

export function SecretReveal({ publishableKey, secretKey }: SecretRevealProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
        Copy your secret key now — it will not be shown again.
      </p>
      <CopyField label="Public Key" value={publishableKey} />
      <CopyField label="Secret Key" value={secretKey} />
    </div>
  );
}
