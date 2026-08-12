"use client";

import { KeyRound, Plus, RotateCcw } from "lucide-react";
import * as React from "react";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Disclosure } from "@/components/ui/disclosure";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BaoError } from "@/lib/bao-client";
import { fromBase64, toBase64 } from "@/lib/encoding";
import {
  useCreateTransitKey,
  useDecrypt,
  useEncrypt,
  useRotateTransitKey,
  useTransitKey,
  useTransitKeys,
} from "@/lib/transit";

const KEY_TYPES = [
  "aes256-gcm96",
  "aes128-gcm96",
  "chacha20-poly1305",
  "ed25519",
  "ecdsa-p256",
  "rsa-2048",
  "rsa-4096",
];

const errMsg = (e: unknown) =>
  e instanceof BaoError ? e.errors.join(", ") : "Something went wrong";

export function TransitDashboard({ mount }: { mount: string }) {
  const keys = useTransitKeys(mount);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const key = useTransitKey(mount, selected);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" />
          <span className="font-mono font-medium">{mount}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            transit
          </span>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> New key
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-64 shrink-0 overflow-auto border-r p-2">
          {keys.isLoading ? (
            <p className="p-2 text-sm text-muted-foreground">Loading…</p>
          ) : keys.data?.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">No keys yet.</p>
          ) : (
            <ul>
              {(keys.data ?? []).map((k) => (
                <li key={k}>
                  <button
                    onClick={() => setSelected(k)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${
                      selected === k ? "bg-accent font-medium" : ""
                    }`}
                  >
                    <KeyRound className="size-4 text-muted-foreground" />
                    <span className="truncate font-mono">{k}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 flex-1 overflow-auto p-6">
          {!selected || !key.data ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a key, or create one.
            </div>
          ) : (
            <KeyDetail mount={mount} data={key.data} />
          )}
        </div>
      </div>

      {creating ? (
        <CreateKeyDialog
          mount={mount}
          onClose={() => setCreating(false)}
          onCreated={(name) => {
            setCreating(false);
            setSelected(name);
            keys.refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function KeyDetail({ mount, data }: { mount: string; data: ReturnType<typeof useTransitKey>["data"] & object }) {
  const rotate = useRotateTransitKey(mount, data.name);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-mono text-lg font-semibold">{data.name}</h2>
          <p className="text-sm text-muted-foreground">
            {data.type} · version {data.latest_version}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => rotate.mutate()} disabled={rotate.isPending}>
          <RotateCcw /> Rotate
        </Button>
      </div>

      {data.supports_encryption ? (
        <CryptoTool mount={mount} name={data.name} />
      ) : (
        <p className="text-sm text-muted-foreground">
          This key type ({data.type}) is used for signing/verification rather than
          encryption.
        </p>
      )}

      <Disclosure label="Key details">
        <dl className="grid grid-cols-[12rem_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Type</dt>
          <dd className="font-mono">{data.type}</dd>
          <dt className="text-muted-foreground">Latest version</dt>
          <dd>{data.latest_version}</dd>
          <dt className="text-muted-foreground">Min decryption version</dt>
          <dd>{data.min_decryption_version}</dd>
          <dt className="text-muted-foreground">Supports encryption</dt>
          <dd>{String(data.supports_encryption)}</dd>
          <dt className="text-muted-foreground">Supports signing</dt>
          <dd>{String(data.supports_signing)}</dd>
        </dl>
      </Disclosure>
    </div>
  );
}

function CryptoTool({ mount, name }: { mount: string; name: string }) {
  const encrypt = useEncrypt(mount, name);
  const decrypt = useDecrypt(mount, name);
  const [plain, setPlain] = React.useState("");
  const [cipher, setCipher] = React.useState("");
  const [outCipher, setOutCipher] = React.useState("");
  const [outPlain, setOutPlain] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <div className="rounded-xl border p-4">
      <h3 className="mb-3 text-sm font-medium">Encrypt / Decrypt</h3>
      <Tabs defaultValue="encrypt">
        <TabsList className="max-w-xs">
          <TabsTrigger value="encrypt">Encrypt</TabsTrigger>
          <TabsTrigger value="decrypt">Decrypt</TabsTrigger>
        </TabsList>

        <TabsContent value="encrypt" className="mt-3 flex flex-col gap-3">
          <Label>Plaintext</Label>
          <textarea
            value={plain}
            onChange={(e) => setPlain(e.target.value)}
            placeholder="type any text…"
            className="h-24 w-full rounded-md border bg-transparent p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            size="sm"
            className="self-start"
            disabled={encrypt.isPending || !plain}
            onClick={async () => {
              setErr(null);
              try {
                setOutCipher(await encrypt.mutateAsync(toBase64(plain)));
              } catch (e) {
                setErr(errMsg(e));
              }
            }}
          >
            Encrypt
          </Button>
          {outCipher ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
              <code className="min-w-0 flex-1 break-all text-xs">{outCipher}</code>
              <CopyButton value={outCipher} />
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="decrypt" className="mt-3 flex flex-col gap-3">
          <Label>Ciphertext</Label>
          <textarea
            value={cipher}
            onChange={(e) => setCipher(e.target.value)}
            placeholder="vault:v1:…"
            className="h-24 w-full rounded-md border bg-transparent p-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            size="sm"
            className="self-start"
            disabled={decrypt.isPending || !cipher}
            onClick={async () => {
              setErr(null);
              try {
                setOutPlain(fromBase64(await decrypt.mutateAsync(cipher.trim())));
              } catch (e) {
                setErr(errMsg(e));
              }
            }}
          >
            Decrypt
          </Button>
          {outPlain ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
              <code className="min-w-0 flex-1 break-all text-sm">{outPlain}</code>
              <CopyButton value={outPlain} />
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
      {err ? <p className="mt-2 text-sm text-destructive">{err}</p> : null}
    </div>
  );
}

function CreateKeyDialog({
  mount,
  onClose,
  onCreated,
}: {
  mount: string;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const create = useCreateTransitKey(mount);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState("aes256-gcm96");
  const [error, setError] = React.useState<string | null>(null);

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader title="New encryption key" onClose={onClose} />
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (!name.trim()) return setError("Name is required");
          try {
            await create.mutateAsync({ name: name.trim(), type });
            onCreated(name.trim());
          } catch (err) {
            setError(errMsg(err));
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono" autoFocus />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Type</Label>
          <SelectField
            onValueChange={setType}
            options={KEY_TYPES.map((keyType) => ({ value: keyType, label: keyType }))}
            value={type}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={create.isPending}>Create</Button>
        </div>
      </form>
    </Dialog>
  );
}
