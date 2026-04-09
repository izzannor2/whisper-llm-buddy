import { useState, useEffect } from 'react';
import { RefreshCw, History, RotateCcw, ChevronUp, Check, AlertTriangle, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  type AppliedUpdate,
  type UpdateManifest,
} from '@/lib/update-system';

export function UpdatePanel() {
  const [version, setVersion] = useState(getCurrentVersion());
  const [history, setHistory] = useState<AppliedUpdate[]>([]);
  const [manifestUrl, setManifestUrl] = useState(() => localStorage.getItem('localdev-update-url') || '');
  const [checking, setChecking] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<UpdateManifest | null>(null);
  const backup = getBackup();

  useEffect(() => {
    setHistory(getUpdateHistory());
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
      toast.error(result.error);
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
    const result = applyUpdate(availableUpdate);
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

  const formatDate = (ts: number) => new Date(ts).toLocaleString();

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

      {/* Check for Updates */}
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

      {/* Available Update */}
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
