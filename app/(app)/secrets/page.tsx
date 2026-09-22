"use client";

import { Box, Database, GitCompare, Lock, Network, Package, Plus, ScrollText, Settings, Terminal, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { GrantAccessDialog } from "@/components/grant-access-dialog";
import { IssueCredentialDialog } from "@/components/issue-credential-dialog";
import { LabelEditor } from "@/components/label-editor";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { NewEnvironmentDialog } from "@/components/new-environment-dialog";
import { PageHeader } from "@/components/page-header";
import { ProjectsMatrix } from "@/components/secrets/projects-matrix";
import { EnvironmentRail } from "@/components/secrets/environment-rail";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveEnvs, useAccessRoles } from "@/lib/access-roles";
import { useCan } from "@/lib/acl";
import { useProjectCredentials } from "@/lib/project-credentials";
import { useProjects, useDeleteProject, useSeedProjectInEnv, type ProjectInfo, type KvMount } from "@/lib/projects";
import { useDisableSecretEngine, useMounts } from "@/lib/kv";
import { labelKey, useClearLabel, useLabels } from "@/lib/labels";

const SUPPORTED = new Set([
  "kv", "generic", "transit", "pki", "ssh", "database", "cubbyhole", "identity", "system",
]);

function destinationFor(type: string, name: string) {
  if (type === "identity") return "/access/identity";
  if (type === "system") return "/operations";
  return `/secrets/${name}`;
}

function engineMeta(type: string) {
  switch (type) {
    case "transit":
      return { icon: Lock, blurb: "Encryption as a service" };
    case "pki":
      return { icon: ScrollText, blurb: "Certificate authority" };
    case "ssh":
      return { icon: Terminal, blurb: "SSH certificates" };
    case "database":
      return { icon: Database, blurb: "Dynamic database credentials" };
    case "cubbyhole":
      return { icon: Box, blurb: "Per-token private storage" };
    case "identity":
      return { icon: Users, blurb: "Entities & groups → Access" };
    case "system":
      return { icon: Settings, blurb: "System backend → Operations" };
    default:
      return { icon: Database, blurb: "—" };
  }
}

export default function SecretsPage() {
  const { data: mounts, isLoading, isError } = useMounts();
  const { data: labels } = useLabels();
  const { projects, isLoading: projectsLoading, kvMounts } = useProjects();
  const can = useCan();
  const accessRoles = useAccessRoles();
  const projectCreds = useProjectCredentials();
  const disable = useDisableSecretEngine();
  const clearLabel = useClearLabel();
  const seedEnv = useSeedProjectInEnv();
  const deleteProject = useDeleteProject();

  const [editingEnv, setEditingEnv] = React.useState<string | null>(null);
  const [creatingEnv, setCreatingEnv] = React.useState(false);
  const [creatingProject, setCreatingProject] = React.useState(false);
  const [editingProject, setEditingProject] = React.useState<string | null>(null);
  const [issuing, setIssuing] = React.useState<string | null>(null);
  const [granting, setGranting] = React.useState<string | null>(null);
  const [deletingEnv, setDeletingEnv] = React.useState<string | null>(null);
  const [deleteEnvError, setDeleteEnvError] = React.useState<string | null>(null);
  const [deletingProject, setDeletingProject] = React.useState<ProjectInfo | null>(null);
  const [deleteProjectError, setDeleteProjectError] = React.useState<string | null>(null);
  const [seedError, setSeedError] = React.useState<string | null>(null);

  const envName = (m: string) => labels?.[labelKey("environment", `${m}/`)]?.label || m;
  const envColor = (m: string) => labels?.[labelKey("environment", `${m}/`)]?.color ?? null;

  const kvEnvs = Object.entries(mounts ?? {})
    .filter(([, info]) => info.type === "kv" || info.type === "generic")
    .map(([path, info]) => {
      const mount = path.replace(/\/$/, "");
      const lbl = labels?.[labelKey("environment", path)];
      return {
        path,
        mount,
        type: info.type,
        version: info.options?.version,
        title: lbl?.label || path,
        color: lbl?.color ?? null,
      };
    });

  const otherEngines = Object.entries(mounts ?? {}).filter(
    ([, info]) => info.type !== "kv" && info.type !== "generic",
  );

  const affectedRoles = React.useMemo(() => {
    if (!deletingEnv) return [];
    const m = deletingEnv.replace(/\/$/, "");
    return (accessRoles.data ?? []).filter((r) =>
      resolveEnvs(r.env).some((t) => t.mount === m),
    );
  }, [deletingEnv, accessRoles.data]);

  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new")) setCreatingEnv(true);
  }, []);

  async function confirmDisableEnv() {
    if (!deletingEnv) return;
    setDeleteEnvError(null);
    try {
      await disable.mutateAsync(deletingEnv.replace(/\/$/, ""));
      await clearLabel.mutateAsync({ scope: "environment", ref: deletingEnv }).catch(() => {});
      setDeletingEnv(null);
    } catch (err) {
      setDeleteEnvError(err instanceof Error ? err.message : "Failed to disable");
    }
  }

  async function confirmDeleteProject() {
    if (!deletingProject) return;
    setDeleteProjectError(null);
    try {
      const present = kvMounts.filter((env) => deletingProject.envs.includes(env.mount));
      await deleteProject.mutateAsync({ project: deletingProject.project, envs: present });
      setDeletingProject(null);
    } catch (err) {
      setDeleteProjectError(err instanceof Error ? err.message : "Failed to delete project");
    }
  }

  async function seed(project: string, env: KvMount) {
    setSeedError(null);
    try {
      await seedEnv.mutateAsync({ project, env });
    } catch (err) {
      setSeedError(err instanceof Error ? err.message : "Failed to add project to environment");
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <PageHeader
        title="Secrets"
        description="Apps across KV environments. Other engines stay folded away."
        className="mb-8"
        actions={
          <>
            <Link
              href="/secrets/structure"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <Network /> Structure
            </Link>
            <Link
              href="/secrets/compare"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <GitCompare /> Compare
            </Link>
            <Link
              href="/secrets/projects"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Package /> Apps
            </Link>
            <Button size="sm" onClick={() => setCreatingProject(true)}>
              <Plus /> New project
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-14 w-56 rounded-lg" />
            <Skeleton className="h-14 w-56 rounded-lg" />
          </div>
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">
          Could not load mounts. Check your token&apos;s permissions.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <section>
            <div className="mb-3">
              <h2 className="text-base font-semibold tracking-tight">Projects</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Open a cell to browse, or add the project where it is missing.
              </p>
            </div>
            {seedError ? <p className="mb-3 text-sm text-destructive">{seedError}</p> : null}
            {projectsLoading ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : (
              <ProjectsMatrix
                projects={projects}
                kvMounts={kvMounts}
                envName={envName}
                envColor={envColor}
                seeding={seedEnv.isPending}
                onCreate={() => setCreatingProject(true)}
                onEdit={setEditingProject}
                onDelete={(project) => {
                  setDeleteProjectError(null);
                  setDeletingProject(project);
                }}
                onSeed={seed}
                onIssue={setIssuing}
                onGrant={setGranting}
              />
            )}
          </section>

          {/* Environments are the mounts projects live in — needed to set up,
              rarely while working. Open by default until a project exists, so
              first-run still surfaces "New environment". */}
          <Disclosure
            label="Environments"
            count={kvEnvs.length}
            defaultOpen={projects.length === 0}
          >
            <EnvironmentRail
              envs={kvEnvs}
              canManage={can("sys/mounts")}
              onCreate={() => setCreatingEnv(true)}
              onEdit={setEditingEnv}
              onDelete={(path) => {
                setDeleteEnvError(null);
                setDeletingEnv(path);
              }}
            />
          </Disclosure>

          {otherEngines.length ? (
            <Disclosure label="Other secret engines" count={otherEngines.length}>
              <ul className="divide-y">
                {otherEngines.map(([path, info]) => {
                  const name = path.replace(/\/$/, "");
                  const supported = SUPPORTED.has(info.type);
                  const { icon: Icon, blurb } = engineMeta(info.type);
                  const row = (
                    <div className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-medium">{path}</span>
                          <Badge variant="muted">{info.type}</Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {info.description || blurb}
                          {!supported ? " · UI coming soon" : ""}
                        </p>
                      </div>
                    </div>
                  );
                  return (
                    <li key={path}>
                      {supported ? (
                        <Link
                          href={destinationFor(info.type, name)}
                          className="block rounded-md px-1 -mx-1 transition-colors duration-150 hover:bg-accent"
                        >
                          {row}
                        </Link>
                      ) : (
                        <div className="opacity-60">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Disclosure>
          ) : null}
        </div>
      )}

      {editingEnv ? (
        <LabelEditor
          open
          onClose={() => setEditingEnv(null)}
          scope="environment"
          refPath={editingEnv}
          current={labels?.[labelKey("environment", editingEnv)]}
          nativeName={editingEnv}
        />
      ) : null}

      {editingProject ? (
        <LabelEditor
          open
          onClose={() => setEditingProject(null)}
          scope="project"
          refPath={editingProject}
          current={labels?.[labelKey("project", editingProject)]}
          nativeName={editingProject}
        />
      ) : null}

      {creatingEnv ? <NewEnvironmentDialog onClose={() => setCreatingEnv(false)} /> : null}
      {creatingProject ? <NewProjectDialog onClose={() => setCreatingProject(false)} /> : null}
      {issuing ? (
        <IssueCredentialDialog existing={projectCreds.data ?? []} initialProject={issuing} onClose={() => setIssuing(null)} />
      ) : null}
      {granting ? (
        <GrantAccessDialog existing={accessRoles.data ?? []} initialProject={granting} onClose={() => setGranting(null)} />
      ) : null}

      <ConfirmDialog
        open={!!deletingEnv}
        onClose={() => setDeletingEnv(null)}
        onConfirm={confirmDisableEnv}
        title="Disable environment"
        description={`This permanently deletes the "${deletingEnv?.replace(/\/$/, "")}" engine and ALL secrets stored in it. This cannot be undone.`}
        confirmText={deletingEnv?.replace(/\/$/, "")}
        confirmLabel="Disable environment"
        pending={disable.isPending || clearLabel.isPending}
        warning={
          affectedRoles.length > 0 ? (
            <>
              <strong>{affectedRoles.length} scoped role{affectedRoles.length === 1 ? "" : "s"}</strong>{" "}
              still grant access to this environment:{" "}
              <span className="font-mono">{affectedRoles.map((r) => r.name).join(", ")}</span>.
              Their policies will keep pointing at a deleted mount until you edit or remove them in Access → Team.
            </>
          ) : null
        }
        error={deleteEnvError}
      />

      <ConfirmDialog
        open={!!deletingProject}
        onClose={() => setDeletingProject(null)}
        onConfirm={confirmDeleteProject}
        title="Delete project"
        description={`Permanently deletes every secret under "${deletingProject?.project}/" in ${
          deletingProject?.envs.length
            ? deletingProject.envs.map(envName).join(", ")
            : "no environments"
        }, then unregisters the project.`}
        confirmText={deletingProject?.project}
        confirmLabel="Delete project"
        pending={deleteProject.isPending}
        error={deleteProjectError}
      />
    </div>
  );
}
