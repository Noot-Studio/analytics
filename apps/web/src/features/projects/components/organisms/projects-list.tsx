import { Button } from "@sbox-analytics/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sbox-analytics/ui/components/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import { IconDotsVertical } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { FolderPlus } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { TableSkeleton } from "@/components/table-skeleton";
import { useDataTable } from "@/hooks/use-data-table";
import { useQueryState } from "@/hooks/use-query-state";
import { getSortingStateParser } from "@/lib/parsers";
import { orpc } from "@/utils/orpc";

import { ConfirmButton } from "../atoms/confirm-button";
import { EnvironmentBadge } from "../atoms/environment-badge";
import type { ProjectEnvironment } from "../atoms/environment-badge";

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  environment: ProjectEnvironment;
  createdAt: Date;
  apiKeys: { lastUsedAt: Date | null }[];
}

const PROJECT_COLUMN_IDS = ["name", "slug", "environment"] as const;
type ProjectSortColumn = (typeof PROJECT_COLUMN_IDS)[number];

// Server-side cap on perPage; fetched as a single page since the table is unpaginated.
const MAX_ROWS = 100;

// Self-contained so the column lives at module scope (no component defined
// during ProjectsList's render).
const ProjectActionsCell = ({ project }: { project: ProjectRow }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    ...orpc.projects.delete.mutationOptions(),
    onError: () => toast.error("Failed to delete project"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
      toast.success("Project deleted");
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="flex size-8 data-[state=open]:bg-muted"
            size="icon"
            variant="ghost"
          />
        }
      >
        <IconDotsVertical />
        <span className="sr-only">Open menu</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
        <DropdownMenuItem
          onClick={() =>
            navigate({
              params: { projectId: project.id },
              to: "/dashboard/projects/$projectId",
            })
          }
        >
          View
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            navigate({
              params: { projectId: project.id },
              to: "/dashboard/projects/$projectId/settings",
            })
          }
        >
          Edit
        </DropdownMenuItem>
        <ConfirmButton
          label="Delete"
          onConfirm={() => deleteMutation.mutate({ id: project.id })}
          render={
            <DropdownMenuItem
              closeOnClick={false}
              disabled={deleteMutation.isPending}
              variant="destructive"
            />
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const columns: ColumnDef<ProjectRow>[] = [
  {
    accessorKey: "name",
    cell: ({ row }) => (
      <Link
        className="font-medium underline underline-offset-4 hover:text-foreground"
        params={{ projectId: row.original.id }}
        to="/dashboard/projects/$projectId"
      >
        {row.original.name}
      </Link>
    ),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Name" />
    ),
    id: "name",
  },
  {
    accessorKey: "slug",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.slug}</span>
    ),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Slug" />
    ),
    id: "slug",
  },
  {
    accessorKey: "environment",
    cell: ({ row }) => (
      <EnvironmentBadge environment={row.original.environment} />
    ),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Environment" />
    ),
    id: "environment",
  },
  {
    cell: ({ row }) => <ProjectActionsCell project={row.original} />,
    enableSorting: false,
    header: () => <span className="sr-only">Actions</span>,
    id: "actions",
  },
];

export const ProjectsList = () => {
  const [sorting] = useQueryState(
    "sort",
    getSortingStateParser<ProjectRow>().withDefault([])
  );
  const sortEntry = sorting[0] ?? null;

  const listQuery = useQuery(
    orpc.projects.list.queryOptions({
      input: {
        perPage: MAX_ROWS,
        sortBy: sortEntry?.id as ProjectSortColumn | undefined,
        sortDesc: sortEntry?.desc ?? true,
      },
    })
  );

  const rows = (listQuery.data?.rows ?? []) as ProjectRow[];
  const total = listQuery.data?.total ?? 0;

  const { table } = useDataTable({
    columns,
    data: rows,
    getRowId: (row) => row.id,
    pageCount: 1,
  });

  if (listQuery.isLoading) {
    return <TableSkeleton rows={5} />;
  }

  if (listQuery.isError) {
    return (
      <div className="py-8 text-center text-destructive">
        Failed to load projects.
      </div>
    );
  }

  if (total === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderPlus />
          </EmptyMedia>
          <EmptyTitle>No projects yet</EmptyTitle>
          <EmptyDescription>
            Create your first project to start tracking s&box game analytics.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return <DataTable hidePagination table={table} />;
};
