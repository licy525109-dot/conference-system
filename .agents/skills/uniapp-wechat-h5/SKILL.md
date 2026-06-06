---
name: uniapp-wechat-h5
description: Use this skill when implementing uni-app user pages for H5 and WeChat Mini Program, including routing, API clients, wx.login, payment wrapper, and platform differences.
---

# UniApp WeChat + H5

## When to use

Use for apps/user pages, components, API calls, H5 runtime, mp-weixin runtime, login wrapper, and payment wrapper.

## Rules

1. Keep business logic shared between H5 and mp-weixin.
2. Platform-specific logic must be isolated in services, not scattered in pages.
3. API base URL must come from environment/config.
4. Use backend quote for display only.
5. Do not calculate trusted payable amount on frontend.
6. Use cents-to-yuan formatting only for display.
7. Develop H5 first for speed, then validate mp-weixin in WeChat Developer Tools.

## Required pages

- home
- conference detail
- registration form
- order confirm
- payment result
- my registrations
