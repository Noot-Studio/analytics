import { Button } from "@sbox-analytics/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sbox-analytics/ui/components/dialog";
import { DotmSquare4 } from "@sbox-analytics/ui/components/dotm-square-4";
import { Input } from "@sbox-analytics/ui/components/input";
import { Label } from "@sbox-analytics/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sbox-analytics/ui/components/select";
import { useState } from "react";

import type { ProjectEnvironment } from "../atoms/environment-badge";

interface CreateProjectDialogProps {
  isPending: boolean;
  onCreate: (name: string, environment: ProjectEnvironment) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const ENVIRONMENTS: ProjectEnvironment[] = [
  "Development",
  "Staging",
  "Production",
];

export const CreateProjectDialog = ({
  isPending,
  onCreate,
  onOpenChange,
  open,
}: CreateProjectDialogProps) => {
  const [name, setName] = useState("");
  const [environment, setEnvironment] =
    useState<ProjectEnvironment>("Development");

  const handleSubmit = (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate(name.trim(), environment);
      setName("");
      setEnvironment("Development");
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>
            Create a new project to track analytics for your game.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                onChange={(e) => setName(e.target.value)}
                placeholder="My Awesome Game"
                value={name}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="environment">Environment</Label>
              <Select
                onValueChange={(value) => {
                  if (value) {
                    setEnvironment(value as ProjectEnvironment);
                  }
                }}
                value={environment}
              >
                <SelectTrigger id="environment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENVIRONMENTS.map((env) => (
                    <SelectItem key={env} value={env}>
                      {env}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isPending || !name.trim()} type="submit">
              {isPending ? (
                <DotmSquare4 ariaLabel="Creating" dotSize={2} size={18} />
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
