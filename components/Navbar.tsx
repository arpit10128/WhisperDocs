"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

const navItems = [
  { label: "Library", href: "/" },
  { label: "Add New", href: "/pdfs/new" },
];

const Navbar = () => {
  const pathName = usePathname();

  return (
    <header className="w-full fixed z-50 bg-('--bg-primary')">
      <div className="wrapper navbar-height py-4 flex justify-between items-center">
        <Link
          href={"/"}
          className="flex gap-0.5 items-center"
        >
          <Image
            src={"/assets/logo.png"}
            alt="WhisperDocs"
            width={42}
            height={26}
          />
          <span className="logo-text">WhisperDocs</span>
        </Link>

        <nav className="w-fit gap-7.5 flex items-center">
          {navItems.map(({ label, href }) => {
            const isActive =
              pathName === href ||
              (href !== "/" && pathName.startsWith(href));

            return (
              <Link
                href={href}
                key={label}
                className={`nav-link-base ${isActive ? "nav-link-active" : "text-black hover:opacity-70"}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
