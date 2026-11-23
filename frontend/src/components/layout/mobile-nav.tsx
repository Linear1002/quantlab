"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Brand } from "./app-sidebar";
import { NavLinks } from "./nav-links";

/** スマホ用のヘッダー。メニューボタンで左からナビゲーションを開く(md 未満で表示) */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-ink/90 px-4 backdrop-blur md:hidden">
      <Brand />
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger
          aria-label="メニューを開く"
          className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Menu className="size-5" />
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <Dialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-line bg-ink px-3 py-4 transition-transform duration-200 ease-out data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full">
            <div className="flex items-center justify-between">
              <Dialog.Title className="sr-only">メニュー</Dialog.Title>
              <Brand />
              <Dialog.Close
                aria-label="メニューを閉じる"
                className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-5" />
              </Dialog.Close>
            </div>
            <div className="mt-6">
              <NavLinks layoutId="mobile-active" onNavigate={() => setOpen(false)} />
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </header>
  );
}
