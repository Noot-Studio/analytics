import type {
  CustomCardConfig,
  DashboardCardInput,
} from "@sbox-analytics/api/dashboard-cards";
import { BUILTIN_CARD_TYPES } from "@sbox-analytics/api/dashboard-cards";
import { Button } from "@sbox-analytics/ui/components/button";
import { Input } from "@sbox-analytics/ui/components/input";
import { Label } from "@sbox-analytics/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sbox-analytics/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@sbox-analytics/ui/components/sheet";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useIsMobile } from "@sbox-analytics/ui/hooks/use-mobile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Suspense, useState } from "react";
import type { ReactNode } from "react";

import { orpc } from "@/utils/orpc";

import { CARD_REGISTRY } from "../../lib/card-registry";
import type { DashboardScopeValue } from "../../lib/use-dashboard-editor";
import { CardErrorBoundary } from "../atoms/card-error-boundary";
import { CustomCardForm } from "./custom-card-form";

const ORG_WIDE = "__org__";
const PROJECTS_PAGE_SIZE = 100;

interface AddCardDrawerProps {
  from: string;
  onAdd: (card: DashboardCardInput) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId?: string;
  projectId?: string;
  scope: DashboardScopeValue;
  to: string;
}

const CardPreview = ({ children }: { children: ReactNode }) => (
  <div className="pointer-events-none select-none">
    <CardErrorBoundary>
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        {children}
      </Suspense>
    </CardErrorBoundary>
  </div>
);

export const AddCardDrawer = ({
  from,
  onAdd,
  onOpenChange,
  open,
  organizationId,
  projectId,
  scope,
  to,
}: AddCardDrawerProps) => {
  const isMobile = useIsMobile();
  const isOrgScope = scope === "OrgOverview";
  const queryClient = useQueryClient();
  const [pin, setPin] = useState(ORG_WIDE);
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const { data: projects } = useQuery(
    orpc.projects.list.queryOptions({
      enabled: isOrgScope && open,
      input: { perPage: PROJECTS_PAGE_SIZE },
    })
  );

  const libraryQueryOptions = orpc.dashboards.libraryList.queryOptions({
    enabled: open,
    input: { organizationId, projectId },
  });
  const { data: library } = useQuery(libraryQueryOptions);

  const invalidateLibrary = () =>
    queryClient.invalidateQueries({ queryKey: libraryQueryOptions.queryKey });

  const createMutation = useMutation(
    orpc.dashboards.libraryCreate.mutationOptions({
      onSuccess: invalidateLibrary,
    })
  );
  const deleteMutation = useMutation(
    orpc.dashboards.libraryDelete.mutationOptions({
      onSuccess: invalidateLibrary,
    })
  );

  // Select renders labels (not raw values) through the items map.
  const sourceItems: Record<string, string> = {
    [ORG_WIDE]: "Whole organization",
    ...Object.fromEntries(
      (projects?.rows ?? []).map((project) => [project.id, project.name])
    ),
  };

  const pinnedProjectId = pin === ORG_WIDE ? undefined : pin;
  // Custom cards query project-scoped data; org dashboards must pin one.
  const customProjectId = projectId ?? pinnedProjectId;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSearch("");
      setIsCreating(false);
    }
    onOpenChange(next);
  };

  const addBuiltin = (cardType: (typeof BUILTIN_CARD_TYPES)[number]) => {
    onAdd({
      cardType,
      config: pinnedProjectId ? { projectId: pinnedProjectId } : {},
      size: CARD_REGISTRY[cardType].defaultSize,
    });
    handleOpenChange(false);
  };

  const addCustom = (config: CustomCardConfig) => {
    onAdd({
      cardType: "custom.stat",
      config,
      size: config.display === "timeseries" ? "Full" : "Third",
    });
    handleOpenChange(false);
  };

  // Creating saves the definition to the library, then places it.
  const createCustom = (card: DashboardCardInput) => {
    if (card.cardType !== "custom.stat") {
      return;
    }
    createMutation.mutate({
      config: card.config,
      organizationId,
      projectId,
    });
    addCustom(card.config);
  };

  const query = search.trim().toLowerCase();
  const matches = (...texts: (string | undefined)[]) =>
    query === "" || texts.some((text) => text?.toLowerCase().includes(query));

  const builtins = BUILTIN_CARD_TYPES.filter((cardType) => {
    const definition = CARD_REGISTRY[cardType];
    return matches(definition.title, definition.description);
  });
  const customs = (library ?? []).filter((definition) =>
    matches((definition.config as CustomCardConfig).title, "custom")
  );

  return (
    <Sheet onOpenChange={handleOpenChange} open={open}>
      <SheetContent
        className="data-[side=bottom]:max-h-[85vh] data-[side=right]:sm:max-w-xl"
        side={isMobile ? "bottom" : "right"}
      >
        <SheetHeader className="gap-1">
          <SheetTitle>Add card</SheetTitle>
          <SheetDescription>
            Preview a statistic from the library or create your own.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          {isOrgScope ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-card-project">Data source</Label>
              <Select
                items={sourceItems}
                onValueChange={(value) => value && setPin(value)}
                value={pin}
              >
                <SelectTrigger className="w-full" id="add-card-project">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(sourceItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {isCreating ? (
            <>
              <Button
                className="self-start"
                onClick={() => setIsCreating(false)}
                size="sm"
                variant="ghost"
              >
                <ArrowLeft />
                Back to library
              </Button>
              {customProjectId ? (
                <CustomCardForm
                  from={from}
                  onAdd={createCustom}
                  projectId={customProjectId}
                  to={to}
                />
              ) : (
                <p className="rounded-lg border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
                  Custom statistics query a single project. Pick a project as
                  the data source above first.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Search cards"
                  className="flex-1"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search cards…"
                  value={search}
                />
                <Button onClick={() => setIsCreating(true)} variant="outline">
                  <Plus />
                  New
                </Button>
              </div>

              {builtins.map((cardType) => {
                const definition = CARD_REGISTRY[cardType];
                return (
                  // The preview itself is a card — no extra chrome around it.
                  <div className="flex flex-col gap-2" key={cardType}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground text-xs">
                        {definition.description}
                      </span>
                      <Button
                        aria-label={`Add ${definition.title}`}
                        onClick={() => addBuiltin(cardType)}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <Plus />
                      </Button>
                    </div>
                    <CardPreview>
                      <definition.Renderer
                        config={
                          pinnedProjectId ? { projectId: pinnedProjectId } : {}
                        }
                        from={from}
                        organizationId={organizationId}
                        projectId={projectId}
                        to={to}
                      />
                    </CardPreview>
                  </div>
                );
              })}

              {customs.map((definition) => {
                const config = definition.config as CustomCardConfig;
                const { Renderer } = CARD_REGISTRY["custom.stat"];
                return (
                  <div className="flex flex-col gap-2" key={definition.id}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground text-xs">
                        Custom statistic
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          aria-label={`Delete ${config.title}`}
                          disabled={deleteMutation.isPending}
                          onClick={() =>
                            deleteMutation.mutate({
                              id: definition.id,
                              organizationId,
                              projectId,
                            })
                          }
                          size="icon-sm"
                          variant="ghost"
                        >
                          <Trash2 />
                        </Button>
                        <Button
                          aria-label={`Add ${config.title}`}
                          onClick={() => addCustom(config)}
                          size="icon-sm"
                          variant="ghost"
                        >
                          <Plus />
                        </Button>
                      </div>
                    </div>
                    <CardPreview>
                      <Renderer
                        config={config}
                        from={from}
                        organizationId={organizationId}
                        projectId={projectId}
                        to={to}
                      />
                    </CardPreview>
                  </div>
                );
              })}

              {builtins.length === 0 && customs.length === 0 ? (
                <p className="rounded-lg border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
                  No cards match your search.
                </p>
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
