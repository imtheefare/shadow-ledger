"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMetaMask } from "@/hooks/metamask/useMetaMaskProvider";

export function Navigation() {
  const pathname = usePathname();
  const { isConnected, accounts, connect } = useMetaMask();

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/ledger", label: "Ledger" },
    { href: "/departments", label: "Departments" },
    { href: "/calculations", label: "Calculations" },
    { href: "/audit", label: "Audit" },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="text-xl font-bold gradient-text">
                ShadowLedger
              </Link>
            </div>
            <div className="hidden sm:ml-8 sm:flex sm:space-x-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    pathname === item.href
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center">
            {isConnected ? (
              <div className="flex items-center space-x-3">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-sm font-medium text-foreground bg-muted px-3 py-1.5 rounded-lg">
                  {accounts?.[0]
                    ? `${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`
                    : "Connected"}
                </span>
              </div>
            ) : (
              <button
                onClick={connect}
                className="btn-primary text-sm"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

