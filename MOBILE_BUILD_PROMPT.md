# Mobile Responsive Build Prompt

**Project:** saul-leadgen (Next.js 14 + Tailwind CSS)
**Goal:** Make the entire dashboard fully responsive across all mobile devices (iPhone SE to iPad Pro)
**Current state:** Desktop-only layout with fixed 240px sidebar and 280px activity rail

---

## Breakpoint Strategy

Use Tailwind's default breakpoints:
- `sm` (640px): phones in landscape
- `md` (768px): tablets in portrait (iPad Mini, standard iPad)
- `lg` (1024px): tablets in landscape, small laptops
- `xl` (1280px): desktops (current design target)

---

## Files to Modify

### 1. `src/app/dashboard/layout.tsx` (CRITICAL)

**Current:** Fixed sidebar at 240px left, activity feed at 280px right, content in between.
**Target:**
- Below `lg`: Hide sidebar completely. Hide activity feed completely. Content takes full width.
- `lg` and above: Show sidebar. Content shifts right. Activity feed still hidden.
- `xl` and above: Current layout (sidebar + content + activity feed).

```tsx
// Replace the current layout div with:
<div className="min-h-screen bg-[var(--color-saul-bg-800)] flex">
  <Sidebar />
  <div className="flex flex-col flex-1 min-w-0 lg:ml-[240px] xl:mr-[280px]">
    <TopBar />
    <main className="flex-1 pt-[60px] overflow-y-auto">
      <div className="p-4 md:p-6 max-w-[1600px] mx-auto">{children}</div>
    </main>
  </div>
  <aside className="hidden xl:flex flex-col fixed right-0 top-[60px] bottom-0 w-[280px]">
    <ActivityFeed />
  </aside>
</div>
```

### 2. `src/components/dashboard/Sidebar.tsx` (CRITICAL)

**Current:** Fixed left sidebar, always visible, 240px wide.
**Target:**
- Below `lg`: Hidden by default. Toggled by a hamburger button in `TopBar`.
- When open on mobile: Full-screen overlay with dark backdrop, slides in from left.
- `lg` and above: Current behavior (always visible).

**Implementation:**
- Add a `useSidebarStore` Zustand store (or use React state lifted to layout):
  ```ts
  // src/stores/sidebarStore.ts
  import { create } from 'zustand'
  export const useSidebarStore = create<{ open: boolean; toggle: () => void }>((set) => ({
    open: false,
    toggle: () => set((s) => ({ open: !s.open })),
  }))
  ```
- Wrap the `<aside>` in conditional classes:
  - Mobile: `fixed inset-0 z-50 transform transition-transform` with `-translate-x-full` when closed, `translate-x-0` when open.
  - Add a backdrop `<div>` behind the sidebar when open: `fixed inset-0 z-40 bg-black/60`.
  - Desktop (`lg`+): Remove all mobile-specific classes. Keep `fixed inset-y-0 left-0 w-[240px]`.

### 3. `src/components/dashboard/TopBar.tsx` (CRITICAL)

**Current:** Fixed top bar, no hamburger menu.
**Target:**
- Add a hamburger/menu icon button on the left side, visible only below `lg`.
- On click, it toggles the sidebar open/closed via the Zustand store.
- The existing TopBar content (tenant name, etc.) stays as-is.

```tsx
// Add to the left of the TopBar content:
<button
  className="lg:hidden p-2 text-[var(--color-saul-text-secondary)] hover:text-[var(--color-saul-text-primary)]"
  onClick={() => useSidebarStore.getState().toggle()}
  aria-label="Toggle navigation"
>
  <List size={24} />  // from @phosphor-icons/react
</button>
```

### 4. `src/app/dashboard/DashboardClient.tsx` (MEDIUM)

**Current:** Charts in a 5-column and 3-column grid.
**Target:**
- Below `md`: All charts stack vertically (single column).
- `md` to `lg`: 2-column grid.
- `lg` and above: Current layout.

```tsx
// Chart Row 1: Pipeline + Volume
// Change from: "grid grid-cols-5 gap-4"
// To: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4"
// Pipeline: "col-span-1 md:col-span-1 lg:col-span-2"
// Volume: "col-span-1 md:col-span-1 lg:col-span-3"

// Chart Row 2: Source + Score + Aging
// Change from: "grid grid-cols-3 gap-4"
// To: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
```

### 5. `src/components/dashboard/KPICard.tsx` (EASY)

**Current:** 4 cards in a row.
**Target:**
- Below `sm`: 1 card per row (full width stacked).
- `sm` to `md`: 2 cards per row.
- `md` and above: 4 cards per row (current).

The grid is defined in `DashboardClient.tsx`:
```tsx
// Change from: "grid grid-cols-2 lg:grid-cols-4 gap-4"
// To: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
```

### 6. `src/app/dashboard/leads/LeadsPageClient.tsx` (MEDIUM)

**Current:** Full data table with many columns.
**Target:**
- Below `md`: Show only Company, Score, and Status columns. Hide the rest.
- Add horizontal scroll wrapper for the full table on tablets.
- Ensure filter bar collapses or becomes a dropdown on mobile.

```tsx
// Wrap table in:
<div className="overflow-x-auto">
  <table className="min-w-[800px] w-full">...</table>
</div>

// For hidden columns on mobile:
// Add "hidden md:table-cell" to columns like Industry, Source, Assigned, Red Flags, Last Active
```

### 7. `src/app/dashboard/outreach/OutreachPageClient.tsx` (EASY)

**Current:** Cards are already mostly responsive.
**Target:**
- Ensure action buttons stack vertically on small screens.
- Full-width cards on mobile (remove any side padding that creates gaps).

### 8. `src/components/charts/*.tsx` (EASY)

**Target:**
- Ensure all chart containers have `min-h-[250px]` on mobile (not 280px).
- Reduce chart padding on mobile: `p-4` instead of `p-6`.
- Tooltip should not overflow the viewport on mobile.

### 9. `src/app/globals.css` (EASY)

**Add custom scrollbar styling for mobile:**
```css
@media (max-width: 768px) {
  /* Thinner scrollbar on mobile */
  ::-webkit-scrollbar { width: 3px; height: 3px; }
}
```

---

## Testing Checklist

After implementation, verify the following on each viewport:

### iPhone SE (375px)
- [ ] Sidebar is hidden, hamburger visible
- [ ] KPI cards stack single column
- [ ] Charts stack single column
- [ ] Leads table shows 3 columns max
- [ ] Outreach cards are full width
- [ ] No horizontal overflow on any page

### iPhone 14 Pro (393px)
- [ ] Same as above, slightly more breathing room

### iPad Mini (768px)
- [ ] KPI cards in 2x2 grid
- [ ] Charts in 2-column grid
- [ ] Leads table scrolls horizontally
- [ ] Sidebar still hidden (hamburger)

### iPad Pro 12.9" (1024px)
- [ ] Sidebar visible (no hamburger)
- [ ] Charts in full desktop layout
- [ ] Activity feed still hidden (appears at xl)

### Desktop 1440px+
- [ ] Full layout: sidebar + content + activity feed

---

## Rules

- Do NOT change any colors, fonts, or design tokens.
- Do NOT modify any API calls or data logic.
- Do NOT add any new dependencies.
- Use ONLY Tailwind responsive classes (sm:, md:, lg:, xl:).
- The Zustand sidebar store is the only new file to create.
- Test with `npm run build` after completion. Zero errors.
