import { Button } from "@sbox-analytics/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { TableSkeleton } from "@/components/table-skeleton";
import { useDataTable } from "@/hooks/use-data-table";
import { useQueryState } from "@/hooks/use-query-state";
import { getSortingStateParser } from "@/lib/parsers";
import { orpc } from "@/utils/orpc";

import { CreateApiKeyDialog } from "../molecules/create-api-key-dialog";
import { RevokeApiKeyDialog } from "../molecules/revoke-api-key-dialog";
import { RotateApiKeyDialog } from "../molecules/rotate-api-key-dialog";

interface ApiKeysSectionProps {
  projectId: string;
}

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

const API_KEY_COLUMN_IDS = ["name", "createdAt", "lastUsedAt"] as const;
type ApiKeySortColumn = (typeof API_KEY_COLUMN_IDS)[number];

// Server-side cap on perPage; fetched as a single page since the table is unpaginated.
const MAX_ROWS = 100;

const formatDate = (date: Date | null) => {
  if (!date) {
    return "Never";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(date));
};

const truncateKey = (key: string) => `${key.slice(0, 12)}…`;

const invalidateKeys = (queryClient: ReturnType<typeof useQueryClient>) =>
  queryClient.invalidateQueries({ queryKey: orpc.apiKeys.list.key() });

// Self-contained so the column lives at module scope and each row owns its own
// rotate/revoke dialogs (no component defined during the section's render).
const ApiKeyActionsCell = ({ apiKey }: { apiKey: ApiKeyRow }) => {
  const queryClient = useQueryClient();
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotatedKey, setRotatedKey] = useState<RotatedKey | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const rotateMutation = useMutation({
    ...orpc.apiKeys.rotate.mutationOptions(),
    onError: () => toast.error("Failed to rotate API key"),
    onSuccess: (data) => {
      setRotatedKey(data);
      invalidateKeys(queryClient);
    },
  });

  const revokeMutation = useMutation({
    ...orpc.apiKeys.revoke.mutationOptions(),
    onError: () => toast.error("Failed to revoke API key"),
    onSuccess: () => {
      setRevokeOpen(false);
      invalidateKeys(queryClient);
      toast.success("API key revoked");
    },
  });

  return (
    <div className="flex justify-end gap-2">
      <Button
        onClick={() => {
          setRotatedKey(null);
          setRotateOpen(true);
        }}
        size="sm"
        variant="outline"
      >
        Rotate
      </Button>
      <Button
        onClick={() => setRevokeOpen(true)}
        size="sm"
        variant="destructive"
      >
        Revoke
      </Button>

      <RotateApiKeyDialog
        isPending={rotateMutation.isPending}
        keyName={apiKey.name}
        onConfirm={() => rotateMutation.mutate({ id: apiKey.id })}
        onOpenChange={(open) => {
          setRotateOpen(open);
          if (!open) {
            setRotatedKey(null);
          }
        }}
        open={rotateOpen}
        rotatedKey={rotatedKey}
      />

      <RevokeApiKeyDialog
        isPending={revokeMutation.isPending}
        keyName={apiKey.name}
        onConfirm={() => revokeMutation.mutate({ id: apiKey.id })}
        onOpenChange={setRevokeOpen}
        open={revokeOpen}
      />
    </div>
  );
};

const columns: ColumnDef<ApiKeyRow>[] = [
  {
    accessorKey: "name",
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Name" />
    ),
    id: "name",
  },
  {
    accessorKey: "publishableKey",
    cell: ({ row }) => (
      <span className="font-mono text-muted-foreground text-xs">
        {truncateKey(row.original.publishableKey)}
      </span>
    ),
    enableSorting: false,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Public Key" />
    ),
    id: "publishableKey",
  },
  {
    accessorKey: "createdAt",
    cell: ({ row }) => formatDate(row.original.createdAt),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Created" />
    ),
    id: "createdAt",
  },
  {
    accessorKey: "lastUsedAt",
    cell: ({ row }) => formatDate(row.original.lastUsedAt),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Last Used" />
    ),
    id: "lastUsedAt",
  },
  {
    cell: ({ row }) => <ApiKeyActionsCell apiKey={row.original} />,
    enableSorting: false,
    header: () => <span className="sr-only">Actions</span>,
    id: "actions",
  },
];

export const ApiKeysSection = ({ projectId }: ApiKeysSectionProps) => {
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);

  const [sorting] = useQueryState(
    "sort",
    getSortingStateParser<ApiKeyRow>().withDefault([])
  );
  const sortEntry = sorting[0] ?? null;

  const listQuery = useQuery(
    orpc.apiKeys.list.queryOptions({
      input: {
        perPage: MAX_ROWS,
        projectId,
        sortBy: sortEntry?.id as ApiKeySortColumn | undefined,
        sortDesc: sortEntry?.desc ?? true,
      },
    })
  );

  const createMutation = useMutation({
    ...orpc.apiKeys.create.mutationOptions(),
    onError: () => toast.error("Failed to create API key"),
    onSuccess: (data) => {
      setCreatedKey(data);
      invalidateKeys(queryClient);
    },
  });

  const handleCreateOpen = (open: boolean) => {
    setCreatedKey(null);
    setCreateOpen(open);
  };

  const rows = (listQuery.data?.rows ?? []) as ApiKeyRow[];
  const total = listQuery.data?.total ?? 0;

  const { table } = useDataTable({
    columns,
    data: rows,
    getRowId: (row) => row.id,
    pageCount: 1,
  });

  const isEmpty = total === 0;
  const showTable = !(listQuery.isError || listQuery.isLoading) && !isEmpty;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">API Keys</h2>
          <p className="text-muted-foreground text-sm">
            Key pairs for authenticating game clients against the Ingest API.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          Create API Key
        </Button>
      </div>

      {listQuery.isError ? (
        <p className="py-6 text-center text-destructive text-sm">
          Failed to load API keys.
        </p>
      ) : null}
      {listQuery.isLoading ? <TableSkeleton rows={4} /> : null}
      {!(listQuery.isError || listQuery.isLoading) && isEmpty ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <KeyRound />
            </EmptyMedia>
            <EmptyTitle>No API keys yet</EmptyTitle>
            <EmptyDescription>
              Create an API key to authenticate your s&box game client with the
              Ingest API.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {showTable ? <DataTable hidePagination table={table} /> : null}

      <CreateApiKeyDialog
        createdKey={createdKey}
        isPending={createMutation.isPending}
        onOpenChange={handleCreateOpen}
        onCreate={(name) => createMutation.mutate({ name, projectId })}
        open={createOpen}
      />
    </section>
  );
};
