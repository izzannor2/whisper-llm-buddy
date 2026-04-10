import { useState, useEffect, useRef } from 'react';
import { RefreshCw, History, RotateCcw, ChevronUp, Check, Package, Upload, FolderOpen, Globe, HardDrive, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  getCurrentVersion,
  getUpdateHistory,
  checkForUpdates,
  applyUpdate,
  rollback,
  getBackup,
  bumpVersion,
  getLocalUpdates,
  removeLocalUpdate,
  scanBundledUpdates,
  importLocalUpdateFile,
  applyLocalUpdate,
  compareVersions,
  type AppliedUpdate,
  type UpdateManifest,
  type LocalUpdate,
} from '@/lib/update-system';

export function UpdatePanel() {
  const [version, setVersion] = useState(getCurrentVersion());
  const [history, setHistory] = useState<AppliedUpdate[]>([]);
  const [manifestUrl, setManifestUrl] = useState(() => localStorage.getItem('localdev-update-url') || '');
  const [checking, setChecking] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<UpdateManifest | null>(null);
  const [localUpdates, setLocalUpdates] = useState<LocalUpdate[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backup = getBackup();

  const refreshHistory = () => setHistory(getUpdateHistory());

  const refreshLocalUpdates = async () => {
    setLoadingLocal(true);
    try {
      await scanBundledUpdates();
      const updates = await getLocalUpdates();
      setLocalUpdates(updates);
    } catch {
      toast.error('Failed to load local updates');
    } finally {
      setLoadingLocal(false);
    }
  };

  useEffect(() => {
    refreshHistory();
    refreshLocalUpdates();
  }, [version]);

  const handleCheck = async () => {
    if (!manifestUrl.trim()) {
      toast.error('Enter an update manifest URL first');
      return;
    }
    localStorage.setItem('localdev-update-url', manifestUrl);
    setChecking(true);
    const result = await checkForUpdates(manifestUrl);
    setChecking(false);

    if (result.error) {
      toast.warning(`Online check failed: ${result.error} — showing local updates`);
      await refreshLocalUpdates();
    } else if (result.available && result.manifest) {
      setAvailableUpdate(result.manifest);
      toast.success(`Update available: ${result.manifest.version}`);
    } else {
      setAvailableUpdate(null);
      toast.info('You are on the latest version');
    }
  };

  const handleApply = () => {
    if (!availableUpdate) return;
    const result = applyUpdate(availableUpdate, 'online');
    if (result.success) {
      setVersion(getCurrentVersion());
      setAvailableUpdate(null);
      toast.success(`Updated to ${getCurrentVersion()} (${result.appliedPatches} patches)`);
    } else {
      toast.error(result.error || 'Update failed');
    }
  };

  const handleRollback = () => {
    const result = rollback();
    if (result.success) {
      setVersion(result.restoredVersion);
      toast.success(`Rolled back to ${result.restoredVersion}`);
    } else {
      toast.error('No backup available to rollback');
    }
  };

  const handleBump = (type: 'major' | 'minor' | 'patch') => {
    const newVer = bumpVersion(type);
    setVersion(newVer);
    toast.success(`Version bumped to ${newVer}`);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    let imported = 0;
    for (const file of Array.from(files)) {
      const result = await importLocalUpdateFile(file);
      if (result.success) {
        imported++;
      } else {
        toast.error(`${file.name}: ${result.error}`);
      }
    }

    if (imported > 0) {
      toast.success(`Imported ${imported} update file(s)`);
      await refreshLocalUpdates();
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleApplyLocal = (update: LocalUpdate) => {
    const result = applyLocalUpdate(update);
    if (result.success) {
      setVersion(getCurrentVersion());
      toast.success(`Applied local update ${update.version} (${result.appliedPatches} patches)`);
    } else {
      toast.error(result.error || 'Failed to apply local update');
    }
  };

  const handleRemoveLocal = async (ver: string) => {
    await removeLocalUpdate(ver);
    await refreshLocalUpdates();
    toast.success(`Removed local update ${ver}`);
  };

  const handleReloadAll = async () => {
    setLoadingLocal(true);
    await refreshLocalUpdates();
    setLoadingLocal(false);
    toast.success('Local updates reloaded');
  };

  const isApplied = (ver: string) => history.some(h => h.version === ver);

  const formatDate = (ts: number | string) => {
    if (typeof ts === 'number') return new Date(ts).toLocaleString();
    return ts;
  };

  const sourceLabel = (source?: string) => {
    if (source === 'online') return 'Online';
    if (source === 'local') return 'Local';
    if (source === 'manual') return 'Manual';
    return 'Online';
  };

  return (
    <div className="space-y-5">
      {/* Current Version */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <Package className="w-5 h-5 text-primary" />
          <div>
            <p className="font-semibold text-lg">{version}</p>
            <p className="text-xs text-muted-foreground">Current version</p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleBump('patch')}>+Patch</Button>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleBump('minor')}>+Minor</Button>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleBump('major')}>+Major</Button>
        </div>
      </div>

      {/* Available Online Update */}
      {availableUpdate && (
        <div className="p-4 rounded-xl border-2 border-primary/50 bg-primary/5 space-y-3">
          <div className="flex items-center gap-2">
            <ChevronUp className="w-5 h-5 text-primary" />
            <div>
              <p className="font-semibold">Update Available: {availableUpdate.version}</p>
              <p className="text-xs text-muted-foreground">{availableUpdate.description}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleApply}>
              <Check className="w-4 h-4 mr-1.5" />
              Apply Update ({availableUpdate.patches.length} patches)
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAvailableUpdate(null)}>Dismiss</Button>
          </div>
        </div>
      )}

      {/* Tabs: Online / Local */}
      <Tabs defaultValue="online" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="online" className="flex-1 gap-1.5">
            <Globe className="w-3.5 h-3.5" />
            Online Updates
          </TabsTrigger>
          <TabsTrigger value="local" className="flex-1 gap-1.5">
            <HardDrive className="w-3.5 h-3.5" />
            Local Updates
          </TabsTrigger>
        </TabsList>

        {/* Online Tab */}
        <TabsContent value="online" className="space-y-3 mt-3">
          <div className="space-y-2">
            <Label>Update Manifest URL</Label>
            <div className="flex gap-2">
              <Input
                value={manifestUrl}
                onChange={(e) => setManifestUrl(e.target.value)}
                placeholder="https://example.com/updates/version.json"
                className="bg-muted text-sm"
              />
              <Button variant="outline" onClick={handleCheck} disabled={checking}>
                <RefreshCw className={cn('w-4 h-4 mr-1.5', checking && 'animate-spin')} />
                Check
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Point this to your hosted version.json manifest to receive OTA updates.
            </p>
          </div>
        </TabsContent>

        {/* Local Tab */}
        <TabsContent value="local" className="space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <Label>Imported Update Files</Label>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={handleReloadAll} disabled={loadingLocal}>
                <RefreshCw className={cn('w-3.5 h-3.5 mr-1', loadingLocal && 'animate-spin')} />
                Reload
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-3.5 h-3.5 mr-1" />
                Import .json
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                multiple
                className="hidden"
                onChange={handleImportFile}
              />
            </div>
          </div>

          {localUpdates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FolderOpen className="w-8 h-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No local updates imported</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Import .json update files or place them in public/updates/
              </p>
            </div>
          ) : (
            <ScrollArea className="h-52">
              <div className="space-y-2">
                {localUpdates.map((u) => {
                  const applied = isApplied(u.version);
                  const isNewer = compareVersions(u.version, version) > 0;
                  return (
                    <div
                      key={u.version}
                      className={cn(
                        'p-3 rounded-lg border',
                        applied
                          ? 'border-primary/30 bg-primary/5'
                          : 'border-border bg-muted/30'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-mono font-medium">{u.version}</span>
                            <span className="text-[10px] text-muted-foreground">{u.timestamp}</span>
                            {applied && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Applied</span>
                            )}
                          </div>
                          {u.changes.length > 0 && (
                            <ul className="mt-1.5 space-y-0.5">
                              {u.changes.map((c, i) => (
                                <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1">
                                  <span className="text-primary mt-0.5">•</span>
                                  <span>{c}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {isNewer && !applied && (
                            <Button size="sm" className="h-7 text-xs" onClick={() => handleApplyLocal(u)}>
                              <Check className="w-3 h-3 mr-1" />Apply
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveLocal(u.version)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>

      {/* Rollback */}
      {backup && (
        <div className="flex items-center justify-between p-3 rounded-lg border border-border">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Rollback Available</p>
              <p className="text-[10px] text-muted-foreground">
                Restore to {backup.version} — saved {formatDate(backup.timestamp)}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleRollback}>
            <RotateCcw className="w-3 h-3 mr-1" />Rollback
          </Button>
        </div>
      )}

      {/* History */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          <Label>Update History</Label>
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No updates applied yet</p>
        ) : (
          <ScrollArea className="h-48">
            <div className="space-y-1.5">
              {history.map((entry, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-medium">{entry.version}</span>
                      {entry.patchCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{entry.patchCount} patches</span>
                      )}
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded',
                        entry.source === 'local' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
                      )}>
                        {sourceLabel(entry.source)}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{entry.description}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">{formatDate(entry.appliedAt)}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
