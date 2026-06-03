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
import { useMemo } from "react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableAdvancedToolbar } from "@/components/data-table/data-table-advanced-toolbar";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableFilterList } from "@/components/data-table/data-table-filter-list";
import { DataTableSortList } from "@/components/data-table/data-table-sort-list";
import { TableSkeleton } from "@/components/table-skeleton";
import { toApiFilters } from "@/features/analytics/lib/api-filters";
import { useDataTable } from "@/hooks/use-data-table";
import { useQueryState } from "@/hooks/use-query-state";
import { getFiltersStateParser, getSortingStateParser } from "@/lib/parsers";
import { parseAsInteger, parseAsStringEnum } from "@/lib/query-params";
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

const ENVIRONMENT_OPTIONS = [
  { label: "Development", value: "Development" },
  { label: "Staging", value: "Staging" },
  { label: "Production", value: "Production" },
];

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
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Name" />
    ),
    id: "name",
    meta: { label: "Name", variant: "text" },
  },
  {
    accessorKey: "slug",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.slug}</span>
    ),
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Slug" />
    ),
    id: "slug",
    meta: { label: "Slug", variant: "text" },
  },
  {
    accessorKey: "environment",
    cell: ({ row }) => (
      <EnvironmentBadge environment={row.original.environment} />
    ),
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Environment" />
    ),
    id: "environment",
    meta: {
      label: "Environment",
      options: ENVIRONMENT_OPTIONS,
      variant: "select",
    },
  },
  {
    cell: ({ row }) => <ProjectActionsCell project={row.original} />,
    enableColumnFilter: false,
    enableSorting: false,
    header: () => <span className="sr-only">Actions</span>,
    id: "actions",
  },
];

// Module-level parsers: stable references prevent useMemo invalidation on every render.
const projectsFiltersParser = getFiltersStateParser<ProjectRow>([
  ...PROJECT_COLUMN_IDS,
]).withDefault([]);
const joinOperatorParser = parseAsStringEnum([
  "and",
  "or",
] as const).withDefault("and");

export const ProjectsList = () => {
  const [page] = useQueryState("page", parseAsInteger.withDefault(1));
  const [perPage] = useQueryState("perPage", parseAsInteger.withDefault(10));
  const [sorting] = useQueryState(
    "sort",
    getSortingStateParser<ProjectRow>().withDefault([])
  );
  const sortEntry = sorting[0] ?? null;
  const [tableFilters] = useQueryState("filters", projectsFiltersParser);
  const [joinOperator] = useQueryState("joinOperator", joinOperatorParser);

  const apiFilters = useMemo(() => toApiFilters(tableFilters), [tableFilters]);

  const listQuery = useQuery(
    orpc.projects.list.queryOptions({
      input: {
        filters: apiFilters.length > 0 ? apiFilters : undefined,
        joinOperator,
        page,
        perPage,
        sortBy: sortEntry?.id as ProjectSortColumn | undefined,
        sortDesc: sortEntry?.desc ?? true,
      },
    })
  );

  const rows = (listQuery.data?.rows ?? []) as ProjectRow[];
  const total = listQuery.data?.total ?? 0;
  const pageCount = perPage > 0 ? Math.ceil(total / perPage) : -1;

  const { table } = useDataTable({
    columns,
    data: rows,
    getRowId: (row) => row.id,
    pageCount,
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

  if (total === 0 && apiFilters.length === 0) {
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

  return (
    <DataTable table={table}>
      <DataTableAdvancedToolbar table={table}>
        <DataTableFilterList table={table} />
        <DataTableSortList table={table} />
      </DataTableAdvancedToolbar>
    </DataTable>
  );
};
