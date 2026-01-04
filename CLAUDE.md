# Next.js Development Cheatsheet

> Comprehensive guide for building Next.js applications using the App Router (Next.js 13+)

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Routing](#routing)
3. [Server and Client Components](#server-and-client-components)
4. [Layouts and Pages](#layouts-and-pages)
5. [Navigation](#navigation)
6. [Data Fetching](#data-fetching)
7. [Data Mutation (Server Actions)](#data-mutation-server-actions)
8. [Route Handlers (API Routes)](#route-handlers-api-routes)
9. [Font Optimization](#font-optimization)
10. [Image Optimization](#image-optimization)
11. [Caching and Revalidation](#caching-and-revalidation)
12. [Streaming and Loading States](#streaming-and-loading-states)
13. [Error Handling](#error-handling)
14. [Metadata and SEO](#metadata-and-seo)
15. [Environment Variables](#environment-variables)
16. [Best Practices](#best-practices)

---

## Project Structure

### Top-Level Folders

| Folder   | Purpose                          |
|----------|----------------------------------|
| `app`    | App Router (recommended)         |
| `pages`  | Pages Router (legacy)            |
| `public` | Static assets served at root     |
| `src`    | Optional application source      |

### Top-Level Files

| File                  | Purpose                              |
|-----------------------|--------------------------------------|
| `next.config.js`      | Next.js configuration                |
| `package.json`        | Dependencies and scripts             |
| `tsconfig.json`       | TypeScript configuration             |
| `instrumentation.ts`  | OpenTelemetry and instrumentation    |
| `.env`                | Environment variables                |
| `.env.local`          | Local environment variables (gitignored) |
| `.env.production`     | Production environment variables     |
| `.env.development`    | Development environment variables    |

### Special Files in `app` Directory

| File            | Purpose                                      |
|-----------------|----------------------------------------------|
| `layout.tsx`    | Shared UI wrapper (persists across navigation) |
| `page.tsx`      | Page component (makes route publicly accessible) |
| `loading.tsx`   | Loading UI (Suspense boundary)               |
| `error.tsx`     | Error boundary UI                            |
| `not-found.tsx` | 404 UI                                       |
| `route.ts`      | API endpoint                                 |
| `template.tsx`  | Re-rendered layout                           |
| `default.tsx`   | Parallel route fallback                      |

### Component Rendering Hierarchy

```
layout.tsx
  └── template.tsx
        └── error.tsx (React error boundary)
              └── loading.tsx (React Suspense boundary)
                    └── not-found.tsx (React error boundary)
                          └── page.tsx or nested layout.tsx
```

---

## Routing

### File-System Based Routing

Routes are defined by folder structure in the `app` directory:

```
app/
├── page.tsx              → /
├── about/
│   └── page.tsx          → /about
├── blog/
│   ├── page.tsx          → /blog
│   └── [slug]/
│       └── page.tsx      → /blog/:slug
└── dashboard/
    ├── layout.tsx        → Shared layout
    ├── page.tsx          → /dashboard
    └── settings/
        └── page.tsx      → /dashboard/settings
```

**Key Rule**: A route is only publicly accessible when it has a `page.tsx` or `route.ts` file.

### Dynamic Routes

| Pattern                        | Example URL                  | Usage           |
|--------------------------------|------------------------------|-----------------|
| `[slug]/page.tsx`              | `/blog/hello-world`          | Single param    |
| `[...slug]/page.tsx`           | `/shop/a/b/c`                | Catch-all       |
| `[[...slug]]/page.tsx`         | `/docs` or `/docs/a/b`       | Optional catch-all |

**Accessing dynamic params:**

```tsx
// app/blog/[slug]/page.tsx
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <h1>Post: {slug}</h1>
}
```

### Route Groups

Use parentheses `(folderName)` to organize routes without affecting URL:

```
app/
├── (marketing)/
│   ├── layout.tsx          → Marketing layout
│   └── page.tsx            → /
├── (shop)/
│   ├── layout.tsx          → Shop layout
│   ├── cart/page.tsx       → /cart
│   └── account/page.tsx    → /account
```

### Private Folders

Use underscore `_folderName` to exclude from routing:

```
app/
├── _components/           → Not routable
├── _lib/                  → Not routable
└── blog/page.tsx          → /blog
```

### Parallel Routes

Use `@folder` for named slots:

```
app/
├── layout.tsx
├── @dashboard/page.tsx
└── @analytics/page.tsx
```

### Intercepting Routes

| Pattern          | Intercepts                    |
|------------------|-------------------------------|
| `(.)`            | Same level                    |
| `(..)`           | One level up                  |
| `(..)(..)`       | Two levels up                 |
| `(...)`          | From root                     |

---

## Server and Client Components

### Default Behavior

- All components in `app` directory are **Server Components** by default
- Use `'use client'` directive to create Client Components

### When to Use Each

| Server Components                        | Client Components                    |
|------------------------------------------|--------------------------------------|
| Fetch data from database/APIs            | Interactive UI (onClick, onChange)   |
| Access backend resources                 | State management (useState)          |
| Keep sensitive data on server            | Lifecycle effects (useEffect)        |
| Reduce client-side JavaScript            | Browser APIs (localStorage, window)  |
| Improve initial page load                | Custom hooks                         |

### Creating a Client Component

```tsx
'use client'

import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)

  return (
    <button onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  )
}
```

### Composition Patterns

**Pass Server Components as children to Client Components:**

```tsx
// Client Component
'use client'
export default function Modal({ children }) {
  return <dialog>{children}</dialog>
}

// Server Component (parent)
import Modal from './modal'
import ServerContent from './server-content' // Server Component

export default function Page() {
  return (
    <Modal>
      <ServerContent /> {/* Renders on server */}
    </Modal>
  )
}
```

**Pass data from Server to Client:**

```tsx
// Server Component
import LikeButton from './like-button'

export default async function Page() {
  const data = await fetchData()
  return <LikeButton initialCount={data.likes} />
}

// Client Component
'use client'
export function LikeButton({ initialCount }) {
  const [count, setCount] = useState(initialCount)
  // ...
}
```

### Preventing Server Code in Client

```tsx
import 'server-only'

export async function getData() {
  // This will error if imported in a Client Component
  const res = await fetch('...', {
    headers: { authorization: process.env.API_KEY }
  })
  return res.json()
}
```

---

## Layouts and Pages

### Root Layout (Required)

```tsx
// app/layout.tsx
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

### Nested Layouts

```tsx
// app/dashboard/layout.tsx
import Sidebar from '@/components/sidebar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex">
      <Sidebar />
      <main>{children}</main>
    </div>
  )
}
```

### Key Concepts

- **Layouts persist** across navigation (no re-render)
- **Partial rendering**: Only page content updates
- **Client state preserved** in layouts during navigation

---

## Navigation

### Link Component

```tsx
import Link from 'next/link'

export default function Navigation() {
  return (
    <nav>
      <Link href="/">Home</Link>
      <Link href="/about">About</Link>
      <Link href={`/blog/${slug}`}>Blog Post</Link>
      <Link href="/contact" prefetch={false}>Contact</Link>
    </nav>
  )
}
```

### Programmatic Navigation

```tsx
'use client'

import { useRouter } from 'next/navigation'

export default function Form() {
  const router = useRouter()

  function handleSubmit() {
    // Navigate
    router.push('/dashboard')

    // Navigate without adding to history
    router.replace('/dashboard')

    // Refresh current route
    router.refresh()

    // Go back
    router.back()
  }
}
```

### Server-Side Redirect

```tsx
import { redirect } from 'next/navigation'

export default async function Page() {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  return <Dashboard user={user} />
}
```

### Active Link Pattern

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

export default function NavLink({ href, children }) {
  const pathname = usePathname()

  return (
    <Link
      href={href}
      className={clsx(
        'px-4 py-2',
        { 'bg-blue-500 text-white': pathname === href }
      )}
    >
      {children}
    </Link>
  )
}
```

### Prefetching Behavior

- **Static routes**: Fully prefetched automatically
- **Dynamic routes**: Prefetched up to first `loading.tsx`
- **On hover**: Prefetch triggered
- **Disable**: `<Link prefetch={false}>`

---

## Data Fetching

### Server Component Data Fetching (Recommended)

```tsx
// app/posts/page.tsx
export default async function PostsPage() {
  const posts = await fetch('https://api.example.com/posts').then(r => r.json())

  return (
    <ul>
      {posts.map(post => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

### Direct Database Queries

```tsx
import { db } from '@/lib/db'

export default async function UsersPage() {
  const users = await db.query.users.findMany()

  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  )
}
```

### Parallel Data Fetching

```tsx
export default async function Dashboard() {
  // Start all requests simultaneously
  const revenuePromise = fetchRevenue()
  const usersPromise = fetchUsers()
  const ordersPromise = fetchOrders()

  // Wait for all to complete
  const [revenue, users, orders] = await Promise.all([
    revenuePromise,
    usersPromise,
    ordersPromise,
  ])

  return <DashboardContent data={{ revenue, users, orders }} />
}
```

### Sequential Data Fetching (When Dependent)

```tsx
export default async function UserProfile({ params }) {
  const { userId } = await params

  // First fetch user
  const user = await fetchUser(userId)

  // Then fetch user's posts (depends on user)
  const posts = await fetchUserPosts(user.id)

  return <Profile user={user} posts={posts} />
}
```

### Client-Side Data Fetching

**Using React's `use` hook:**

```tsx
// Server Component
export default function Page() {
  const dataPromise = fetchData() // Don't await

  return (
    <Suspense fallback={<Loading />}>
      <DataDisplay dataPromise={dataPromise} />
    </Suspense>
  )
}

// Client Component
'use client'
import { use } from 'react'

export function DataDisplay({ dataPromise }) {
  const data = use(dataPromise)
  return <div>{data.title}</div>
}
```

**Using SWR:**

```tsx
'use client'

import useSWR from 'swr'

const fetcher = (url) => fetch(url).then(r => r.json())

export default function Profile() {
  const { data, error, isLoading } = useSWR('/api/user', fetcher)

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error loading data</div>

  return <div>Hello {data.name}</div>
}
```

### Request Memoization

Next.js automatically deduplicates `fetch` requests with same URL and options in a single render:

```tsx
// Both components can call this - only one request is made
async function getUser() {
  const res = await fetch('https://api.example.com/user')
  return res.json()
}
```

For non-fetch data sources, use React's `cache`:

```tsx
import { cache } from 'react'

export const getUser = cache(async (id) => {
  return await db.query.users.findFirst({ where: eq(users.id, id) })
})
```

---

## Data Mutation (Server Actions)

### Creating Server Actions

**File-level declaration:**

```tsx
// app/actions.ts
'use server'

export async function createPost(formData: FormData) {
  const title = formData.get('title')
  const content = formData.get('content')

  await db.insert(posts).values({ title, content })

  revalidatePath('/posts')
  redirect('/posts')
}
```

**Inline in Server Components:**

```tsx
export default function Page() {
  async function create(formData: FormData) {
    'use server'
    // mutation logic
  }

  return <form action={create}>...</form>
}
```

### Using with Forms

```tsx
// Server Component
import { createPost } from '@/app/actions'

export default function NewPostForm() {
  return (
    <form action={createPost}>
      <input name="title" type="text" required />
      <textarea name="content" required />
      <button type="submit">Create Post</button>
    </form>
  )
}
```

### Using with Event Handlers

```tsx
'use client'

import { updateLikes } from '@/app/actions'

export default function LikeButton({ postId, initialLikes }) {
  const [likes, setLikes] = useState(initialLikes)

  async function handleClick() {
    const newLikes = await updateLikes(postId)
    setLikes(newLikes)
  }

  return (
    <button onClick={handleClick}>
      Likes: {likes}
    </button>
  )
}
```

### Showing Pending State

```tsx
'use client'

import { useActionState } from 'react'
import { createPost } from '@/app/actions'

export default function Form() {
  const [state, action, isPending] = useActionState(createPost, null)

  return (
    <form action={action}>
      <input name="title" disabled={isPending} />
      <button disabled={isPending}>
        {isPending ? 'Creating...' : 'Create'}
      </button>
    </form>
  )
}
```

### Revalidation After Mutation

```tsx
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

export async function updatePost(id: string, formData: FormData) {
  await db.update(posts).set({ ... }).where(eq(posts.id, id))

  // Revalidate specific path
  revalidatePath('/posts')

  // Or revalidate by tag
  revalidateTag('posts')

  // Redirect after mutation
  redirect(`/posts/${id}`)
}
```

### Cookie Management

```tsx
'use server'

import { cookies } from 'next/headers'

export async function setTheme(theme: string) {
  const cookieStore = await cookies()
  cookieStore.set('theme', theme)
}

export async function getTheme() {
  const cookieStore = await cookies()
  return cookieStore.get('theme')?.value ?? 'light'
}
```

---

## Route Handlers (API Routes)

### Basic Route Handler

```tsx
// app/api/posts/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const posts = await db.query.posts.findMany()
  return NextResponse.json(posts)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const post = await db.insert(posts).values(body).returning()
  return NextResponse.json(post, { status: 201 })
}
```

### Dynamic Route Handlers

```tsx
// app/api/posts/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const post = await db.query.posts.findFirst({ where: eq(posts.id, id) })

  if (!post) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(post)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await db.delete(posts).where(eq(posts.id, id))
  return new NextResponse(null, { status: 204 })
}
```

### Supported HTTP Methods

- `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`

### Caching Behavior

- Route Handlers are **NOT cached by default**
- Only `GET` methods can be cached
- Use `export const dynamic = 'force-static'` to enable caching

```tsx
// app/api/data/route.ts
export const dynamic = 'force-static'

export async function GET() {
  const data = await fetchStaticData()
  return Response.json(data)
}
```

### Important Notes

- Cannot have `route.ts` at same level as `page.tsx`
- Route Handlers don't participate in layouts

---

## Font Optimization

### Using Google Fonts

```tsx
// app/ui/fonts.ts
import { Inter, Roboto_Mono } from 'next/font/google'

export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

export const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
})
```

### Applying Fonts

```tsx
// app/layout.tsx
import { inter } from '@/app/ui/fonts'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

### Font with Variable Weights

```tsx
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

// Use as CSS variable
<body className={inter.variable}>
```

### Benefits

- Fonts downloaded at **build time**
- Hosted with static assets
- **No additional network requests** at runtime
- Prevents layout shift (CLS)

---

## Image Optimization

### Using the Image Component

```tsx
import Image from 'next/image'

export default function Hero() {
  return (
    <Image
      src="/hero.png"
      alt="Hero image"
      width={1200}
      height={600}
      priority // Load immediately (above fold)
    />
  )
}
```

### Responsive Images

```tsx
import Image from 'next/image'

export default function ResponsiveImage() {
  return (
    <div className="relative h-64 w-full">
      <Image
        src="/banner.jpg"
        alt="Banner"
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 50vw"
      />
    </div>
  )
}
```

### External Images

```tsx
// next.config.js
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'example.com',
      },
    ],
  },
}
```

### Image Component Benefits

- **Automatic lazy loading** (images load as they enter viewport)
- **Automatic sizing** for different devices
- **Modern formats** (WebP, AVIF when supported)
- **Prevents layout shift** (reserves space)
- **Automatic optimization** and caching

### Props Reference

| Prop       | Description                          |
|------------|--------------------------------------|
| `src`      | Image source (required)              |
| `alt`      | Alt text (required)                  |
| `width`    | Intrinsic width in pixels            |
| `height`   | Intrinsic height in pixels           |
| `fill`     | Fill parent container                |
| `sizes`    | Media query hints for responsive     |
| `priority` | Preload (use for LCP images)         |
| `quality`  | 1-100 (default: 75)                  |
| `placeholder` | `blur` or `empty`                 |

---

## Caching and Revalidation

### Fetch Caching Options

```tsx
// Force cache (default for static data)
fetch('https://api.example.com/data', { cache: 'force-cache' })

// No cache (always fresh)
fetch('https://api.example.com/data', { cache: 'no-store' })

// Time-based revalidation
fetch('https://api.example.com/data', { next: { revalidate: 3600 } })

// Tag-based revalidation
fetch('https://api.example.com/data', { next: { tags: ['posts'] } })
```

### Route Segment Config

```tsx
// app/posts/page.tsx

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Force static rendering
export const dynamic = 'force-static'

// Revalidate every hour
export const revalidate = 3600

// Don't revalidate
export const revalidate = false
```

### On-Demand Revalidation

```tsx
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'

export async function updateData() {
  // Revalidate specific path
  revalidatePath('/posts')

  // Revalidate all paths with tag
  revalidateTag('posts')
}
```

---

## Streaming and Loading States

### Page-Level Loading

```tsx
// app/dashboard/loading.tsx
export default function Loading() {
  return <DashboardSkeleton />
}
```

### Component-Level Suspense

```tsx
import { Suspense } from 'react'

export default function Page() {
  return (
    <div>
      <h1>Dashboard</h1>

      <Suspense fallback={<ChartSkeleton />}>
        <RevenueChart />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <RecentOrders />
      </Suspense>
    </div>
  )
}
```

### Benefits

- **Immediate navigation feedback**
- **Progressive content loading**
- **Interruptible navigation**
- **Improved Core Web Vitals**

---

## Error Handling

### Error Boundary

```tsx
// app/dashboard/error.tsx
'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  )
}
```

### Global Error Boundary

```tsx
// app/global-error.tsx
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  )
}
```

### Not Found Page

```tsx
// app/not-found.tsx
import Link from 'next/link'

export default function NotFound() {
  return (
    <div>
      <h2>Not Found</h2>
      <p>Could not find requested resource</p>
      <Link href="/">Return Home</Link>
    </div>
  )
}
```

### Triggering Not Found

```tsx
import { notFound } from 'next/navigation'

export default async function Page({ params }) {
  const { id } = await params
  const post = await fetchPost(id)

  if (!post) {
    notFound()
  }

  return <Article post={post} />
}
```

---

## Metadata and SEO

### Static Metadata

```tsx
// app/layout.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My App',
  description: 'My app description',
  openGraph: {
    title: 'My App',
    description: 'My app description',
    images: ['/og-image.png'],
  },
}
```

### Dynamic Metadata

```tsx
// app/posts/[slug]/page.tsx
import type { Metadata } from 'next'

export async function generateMetadata({ params }): Promise<Metadata> {
  const { slug } = await params
  const post = await fetchPost(slug)

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      images: [post.image],
    },
  }
}
```

### Metadata Files

| File                 | Purpose                |
|----------------------|------------------------|
| `favicon.ico`        | Favicon               |
| `icon.png`           | App icon              |
| `apple-icon.png`     | Apple touch icon      |
| `opengraph-image.png`| OpenGraph image       |
| `twitter-image.png`  | Twitter card image    |
| `sitemap.xml`        | Sitemap               |
| `robots.txt`         | Robots file           |

### Generated Metadata Files

```tsx
// app/opengraph-image.tsx
import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export default async function Image() {
  return new ImageResponse(
    (
      <div style={{ fontSize: 48, background: 'white', width: '100%', height: '100%' }}>
        My App
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
```

---

## Environment Variables

### File Conventions

| File                | Purpose                           |
|---------------------|-----------------------------------|
| `.env`              | All environments                  |
| `.env.local`        | Local overrides (gitignored)      |
| `.env.development`  | Development only                  |
| `.env.production`   | Production only                   |
| `.env.test`         | Test only                         |

### Server vs Client Variables

```bash
# Server-only (default)
DATABASE_URL="postgres://..."
API_SECRET="secret"

# Exposed to browser (prefix with NEXT_PUBLIC_)
NEXT_PUBLIC_API_URL="https://api.example.com"
NEXT_PUBLIC_GA_ID="G-XXXXXXX"
```

### Usage

```tsx
// Server Component or Server Action
const dbUrl = process.env.DATABASE_URL

// Client Component
const apiUrl = process.env.NEXT_PUBLIC_API_URL
```

---

## Best Practices

### Component Organization

1. **Default to Server Components** - Only use Client Components when needed
2. **Keep Client Components small** - Minimize client-side JavaScript
3. **Colocate files** - Keep components, tests, styles with routes
4. **Use layouts for shared UI** - Navigation, headers, sidebars

### Data Fetching

1. **Fetch in Server Components** - Direct database access is safe
2. **Use parallel fetching** - `Promise.all()` for independent requests
3. **Implement loading states** - Use `loading.tsx` or `<Suspense>`
4. **Cache appropriately** - Use tags for granular revalidation

### Performance

1. **Use `next/image`** - Automatic optimization
2. **Use `next/font`** - No layout shift
3. **Implement streaming** - Progressive loading
4. **Preload critical data** - Use `preload()` pattern

### Security

1. **Never expose secrets to client** - Use server-only code
2. **Validate Server Action inputs** - Always validate FormData
3. **Use `server-only` package** - Prevent accidental imports
4. **Keep sensitive logic server-side** - Auth, payments, etc.

### Code Organization

```
app/
├── (auth)/
│   ├── login/page.tsx
│   └── register/page.tsx
├── (dashboard)/
│   ├── layout.tsx
│   ├── page.tsx
│   └── settings/page.tsx
├── api/
│   └── [...]/route.ts
├── ui/
│   ├── components/
│   └── fonts.ts
├── lib/
│   ├── actions.ts
│   ├── data.ts
│   └── utils.ts
├── layout.tsx
└── page.tsx
```

---

## Quick Reference

### Common Imports

```tsx
// Navigation
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

// Image & Font
import Image from 'next/image'
import { Inter } from 'next/font/google'

// Metadata
import type { Metadata } from 'next'

// Cache
import { revalidatePath, revalidateTag } from 'next/cache'

// Headers & Cookies
import { headers, cookies } from 'next/headers'

// Not Found
import { notFound } from 'next/navigation'
```

### File Naming Conventions

| File         | Purpose                              |
|--------------|--------------------------------------|
| `page.tsx`   | Route page                           |
| `layout.tsx` | Shared layout                        |
| `loading.tsx`| Loading UI                           |
| `error.tsx`  | Error boundary                       |
| `not-found.tsx` | 404 page                          |
| `route.ts`   | API endpoint                         |
| `template.tsx` | Re-rendered layout                 |
| `default.tsx` | Parallel route fallback             |

---

*This cheatsheet is based on Next.js 15+ App Router documentation. Always refer to the [official docs](https://nextjs.org/docs) for the latest updates.*
