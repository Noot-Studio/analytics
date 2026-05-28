import { Button } from "@sbox-analytics/ui/components/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@sbox-analytics/ui/components/drawer";
import { Input } from "@sbox-analytics/ui/components/input";
import { Label } from "@sbox-analytics/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sbox-analytics/ui/components/select";
import { useIsMobile } from "@sbox-analytics/ui/hooks/use-mobile";
import { useState } from "react";

import type { ProjectEnvironment } from "../atoms/environment-badge";

interface CreateProjectDrawerProps {
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

export const CreateProjectDrawer = ({
  isPending,
  onCreate,
  onOpenChange,
  open,
}: CreateProjectDrawerProps) => {
  const isMobile = useIsMobile();
  const [name, setName] = useState("");
  const [environment, setEnvironment] =
    useState<ProjectEnvironment>("Development");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate(name.trim(), environment);
      setName("");
      setEnvironment("Development");
    }
  };

  return (
    <Drawer
      direction={isMobile ? "bottom" : "right"}
      onOpenChange={onOpenChange}
      open={open}
    >
      <DrawerContent>
        <DrawerHeader className="gap-1">
          <DrawerTitle>Create Project</DrawerTitle>
          <DrawerDescription>
            Create a new project to track analytics for your game.
          </DrawerDescription>
        </DrawerHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 px-4 py-4">
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
            <Button disabled={isPending || !name.trim()} type="submit">
              {isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
