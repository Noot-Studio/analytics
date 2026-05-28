import { Button } from "@sbox-analytics/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sbox-analytics/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

import { CreateApiKeyDialog } from "../molecules/create-api-key-dialog";
import { RevokeApiKeyDialog } from "../molecules/revoke-api-key-dialog";
import { RotateApiKeyDialog } from "../molecules/rotate-api-key-dialog";

interface ApiKeyRow {
  id: string;
  name: string;
  publishableKey: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

interface CreatedKey {
  id: string;
  name: string;
  publishableKey: string;
  secretKey: string;
}

interface RotatedKey {
  publishableKey: string;
  secretKey: string;
}

function formatDate(date: Date | null) {
  if (!date) {
    return "Never";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(date));
}

function truncateKey(key: string) {
  return `${key.slice(0, 12)}…`;
}

export function ApiKeysSection() {
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);

  const [rotateTarget, setRotateTarget] = useState<ApiKeyRow | null>(null);
  const [rotatedKey, setRotatedKey] = useState<RotatedKey | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);

  const listQuery = useQuery(orpc.apiKeys.list.queryOptions());

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.apiKeys.list.queryOptions().queryKey,
    });

  const createMutation = useMutation({
    ...orpc.apiKeys.create.mutationOptions(),
    onError: () => toast.error("Failed to create API key"),
    onSuccess: (data) => {
      setCreatedKey(data);
      invalidateList();
    },
  });

  const rotateMutation = useMutation({
    ...orpc.apiKeys.rotate.mutationOptions(),
    onError: () => toast.error("Failed to rotate API key"),
    onSuccess: (data) => {
      setRotatedKey(data);
      invalidateList();
    },
  });

  const revokeMutation = useMutation({
    ...orpc.apiKeys.revoke.mutationOptions(),
    onError: () => toast.error("Failed to revoke API key"),
    onSuccess: () => {
      setRevokeTarget(null);
      invalidateList();
      toast.success("API key revoked");
    },
  });

  const handleCreateOpen = (open: boolean) => {
    setCreatedKey(null);
    setCreateOpen(open);
  };

  const handleRotateOpen = (_open: boolean) => {
    setRotateTarget(null);
    setRotatedKey(null);
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">API Keys</h2>
          <p className="text-sm text-muted-foreground">
            Key pairs for authenticating game clients against the Ingest API.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          Create API Key
        </Button>
      </div>

      {listQuery.isError ? (
        <p className="py-6 text-center text-sm text-destructive">
          Failed to load API keys.
        </p>
      ) : (listQuery.data && listQuery.data.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Public Key</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last Used</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.data.map((key) => (
              <TableRow key={key.id}>
                <TableCell className="font-medium">{key.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {truncateKey(key.publishableKey)}
                </TableCell>
                <TableCell>{formatDate(key.createdAt)}</TableCell>
                <TableCell>{formatDate(key.lastUsedAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      onClick={() => {
                        setRotatedKey(null);
                        setRotateTarget(key);
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Rotate
                    </Button>
                    <Button
                      onClick={() => setRevokeTarget(key)}
                      size="sm"
                      variant="destructive"
                    >
                      Revoke
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No API keys yet. Create one to get started.
        </p>
      ))}

      <CreateApiKeyDialog
        createdKey={createdKey}
        isPending={createMutation.isPending}
        onOpenChange={handleCreateOpen}
        onCreate={(name) => createMutation.mutate({ name })}
        open={createOpen}
      />

      <RotateApiKeyDialog
        isPending={rotateMutation.isPending}
        keyName={rotateTarget?.name ?? ""}
        onConfirm={() =>
          rotateTarget && rotateMutation.mutate({ id: rotateTarget.id })
        }
        onOpenChange={handleRotateOpen}
        open={rotateTarget !== null}
        rotatedKey={rotatedKey}
      />

      <RevokeApiKeyDialog
        isPending={revokeMutation.isPending}
        keyName={revokeTarget?.name ?? ""}
        onConfirm={() =>
          revokeTarget && revokeMutation.mutate({ id: revokeTarget.id })
        }
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        open={revokeTarget !== null}
      />
    </section>
  );
}
