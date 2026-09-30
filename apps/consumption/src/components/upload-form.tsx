"use client";

import { UploadForm as SharedUploadForm, type UploadFormProps } from "@kundenportal/ui";
import { useRouter } from "next/navigation";

/**
 * The shared upload form (`@kundenportal/ui`); after a successful upload the page reloads its
 * server data, so the new document shows up in the list.
 */
export function UploadForm(props: Omit<UploadFormProps, "onUploaded" | "announce">) {
  const router = useRouter();
  return <SharedUploadForm {...props} onUploaded={() => router.refresh()} />;
}
