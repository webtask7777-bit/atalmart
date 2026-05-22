"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Bike,
  ArrowLeft,
  Shield,
  Download,
  BarChart3,
  Activity,
  Image as ImageIcon,
  Tag,
  Settings,
  Users,
  QrCode,
  Megaphone,
} from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { AppProviders } from "@/components/providers";
import { useAuth } from "@/lib/hooks/use-auth";
import { ConfirmDialogRoot } from "@/components/ui/confirm-dialog";

type NavGroup = {
  label: string;
  items: { href: string; label: string; icon: typeof LayoutDashboard }[];
};

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/metrics", label: "Metrics", icon: Activity },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Sell",
    items: [
      { href: "/admin/products", label: "Products", icon: Package },
      { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
      { href: "/admin/customers", label: "Customers", icon: Users },
      { href: "/admin/riders", label: "Riders", icon: Bike },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/admin/marketing", label: "Dashboard", icon: Megaphone },
      { href: "/admin/campaigns", label: "Campaigns + QR", icon: QrCode },
      { href: "/admin/banners", label: "Hero Banners", icon: ImageIcon },
      { href: "/admin/coupons", label: "Coupons", icon: Tag },
    ],
  },
  {
    label: "Setup",
    items: [
      { href: "/admin/image-downloader", label: "Image Downloader", icon: Download },
      { href: "/admin/settings", label: "Site Settings", icon: Settings },
    ],
  },
];

// Flat list for mobile bottom nav
const allNavItems = navGroups.flatMap((g) => g.items);

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isDemo, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="h-8 w-8 border-3 border-saffron border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isDemo) {
    return <>{children}</>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <Shield size={48} className="text-gray-300 mb-4" />
        <h2 className="text-xl font-bold text-brown mb-2">Login Required</h2>
        <p className="text-sm text-gray-500 mb-4">
          You need to login as admin to access this panel.
        </p>
        <Link href="/auth" className="text-saffron hover:underline text-sm">
          Go to Login →
        </Link>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <Shield size={48} className="text-red-300 mb-4" />
        <h2 className="text-xl font-bold text-brown mb-2">Access Denied</h2>
        <p className="text-sm text-gray-500 mb-4">
          Your account doesn&apos;t have admin privileges.
        </p>
        <Link href="/" className="text-saffron hover:underline text-sm">
          ← Back to Store
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

function AdminSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-60 bg-brown text-cream shrink-0 hidden md:flex flex-col">
        <div className="p-5 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-saffron rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">A</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-saffron">{APP_NAME}</h1>
              <p className="text-[10px] text-gray-400">Admin Panel</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-3 mb-1.5">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${
                        active
                          ? "bg-saffron text-white font-medium"
                          : "text-gray-300 hover:bg-gray-700 hover:text-white"
                      }`}
                    >
                      <Icon size={16} />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-700">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Store
          </Link>
        </div>
      </aside>

      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 overflow-x-auto">
        <nav className="flex py-2 px-2 gap-1 min-w-max">
          {allNavItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-[10px] whitespace-nowrap ${
                  active ? "text-saffron font-medium" : "text-gray-500 hover:text-brown"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppProviders>
      <AdminSidebar>
        <AdminGuard>{children}</AdminGuard>
      </AdminSidebar>
      <ConfirmDialogRoot />
    </AppProviders>
  );
}
