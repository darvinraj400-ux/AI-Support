"use client";

export function dispatchOpenChat() {
  window.dispatchEvent(new CustomEvent('supportai:open'));
}
