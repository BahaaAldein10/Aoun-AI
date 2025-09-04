// components/spreadsheet-selection-modal.tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { SupportedLang } from "@/lib/dictionaries";
import { Calendar, Clock, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";

type GoogleFile = {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime: string;
};

type SpreadsheetSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  t: Record<string, string>;
  lang: SupportedLang;
};

export function SpreadsheetSelectionModal({
  isOpen,
  onClose,
  onSuccess,
  t,
  lang,
}: SpreadsheetSelectionModalProps) {
  const [spreadsheets, setSpreadsheets] = useState<GoogleFile[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isRtl = lang === "ar";
  const locale = lang === "ar" ? "ar" : "en-US";

  useEffect(() => {
    if (isOpen) {
      fetchSpreadsheets();
    }
  }, [isOpen]);

  const fetchSpreadsheets = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/integrations/google/spreadsheets");
      if (!response.ok) {
        throw new Error("Failed to fetch spreadsheets");
      }
      const data = await response.json();
      setSpreadsheets(data.files || []);
    } catch (error) {
      console.error("Error fetching spreadsheets:", error);
      toast.error(t.toast_error_generic || "Failed to load spreadsheets");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedId) {
      toast.error(t.select_spreadsheet_error || "Please select a spreadsheet");
      return;
    }

    const selectedSpreadsheet = spreadsheets.find((s) => s.id === selectedId);
    if (!selectedSpreadsheet) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/integrations/google/spreadsheet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          spreadsheetId: selectedId,
          spreadsheetName: selectedSpreadsheet.name,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save spreadsheet configuration");
      }

      toast.success(
        t.spreadsheet_configured || "Spreadsheet configured successfully",
      );
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error saving spreadsheet:", error);
      toast.error(t.toast_error_generic || "Failed to configure spreadsheet");
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        lang={lang}
        dir={isRtl ? "rtl" : "ltr"}
        className={`max-w-2xl`}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {t.select_spreadsheet_title || "Select Google Spreadsheet"}
          </DialogTitle>
          <DialogDescription>
            {t.select_spreadsheet_desc ||
              "Choose a Google Spreadsheet to use for your CRM integration"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-3">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : spreadsheets.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">
              <FileSpreadsheet className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p>{t.no_spreadsheets || "No spreadsheets found"}</p>
              <p className="mt-2 text-sm">
                {t.create_spreadsheet_hint ||
                  "Create a spreadsheet in Google Sheets first"}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <RadioGroup value={selectedId} onValueChange={setSelectedId}>
                <div className="space-y-3">
                  {spreadsheets.map((spreadsheet) => (
                    <div
                      key={spreadsheet.id}
                      className="hover:bg-muted/50 flex items-start space-x-3 rounded-lg border p-4 transition-colors"
                    >
                      <RadioGroupItem
                        value={spreadsheet.id}
                        id={spreadsheet.id}
                        className="mt-1"
                      />
                      <Label
                        htmlFor={spreadsheet.id}
                        className="flex-1 cursor-pointer space-y-2"
                      >
                        <div className="text-sm font-medium">
                          {spreadsheet.name}
                        </div>
                        <div className="text-muted-foreground flex items-center gap-4 text-xs">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {t.created || "Created"}{" "}
                              {formatDate(spreadsheet.createdTime)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>
                              {t.modified || "Modified"}{" "}
                              {formatDate(spreadsheet.modifiedTime)}
                            </span>
                          </div>
                        </div>
                      </Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {t.cancel || "Cancel"}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedId || isSaving || isLoading}
          >
            {isSaving
              ? t.configuring || "Configuring..."
              : t.configure_spreadsheet || "Configure Spreadsheet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
