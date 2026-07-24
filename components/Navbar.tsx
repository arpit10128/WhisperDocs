"use client";

import {
  SignInButton,
  SignUpButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";
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
  const { isLoaded, isSignedIn, user } = useUser();

  return (
    <header
      className="w-full fixed z-50 bg-(--bg-primary) bg-[#F0F6FF]/40
    backdrop-blur-xl
    border-b border-white/30
    "
    >
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

          <div className="flex items-center gap-3">
            {!isLoaded ? null : isSignedIn ? (
              <div className="flex gap-7.5 items-center">
                <div className="nav-user-link">
                  <UserButton />
                  {user?.firstName && (
                    <Link
                      href={"/subscriptions"}
                      className="nav-user-name"
                    >
                      {user.firstName}
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <>
                <SignInButton mode="modal">
                  <button className="rounded-full border border-black px-4 py-2 text-sm font-medium transition hover:bg-black hover:text-white">
                    Sign In
                  </button>
                </SignInButton>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
