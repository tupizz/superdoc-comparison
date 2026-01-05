'use client'

import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react'
import clsx from 'clsx'
import type { ReactNode } from 'react'

interface TabItem {
  label: string
  content: ReactNode
}

interface TabsProps {
  tabs: TabItem[]
  className?: string
  defaultIndex?: number
}

export function Tabs({ tabs, className, defaultIndex = 0 }: TabsProps) {
  return (
    <TabGroup defaultIndex={defaultIndex} className={clsx('flex flex-col h-full', className)}>
      <TabList className="flex border-b border-zinc-700/50 bg-zinc-900/50">
        {tabs.map((tab, index) => (
          <Tab
            key={index}
            className={({ selected }) =>
              clsx(
                'flex-1 px-4 py-2.5 text-sm font-medium outline-none transition-colors',
                'focus:outline-none focus:ring-0',
                selected
                  ? 'text-white border-b-2 border-blue-500 bg-zinc-800/50'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30'
              )
            }
          >
            {tab.label}
          </Tab>
        ))}
      </TabList>
      <TabPanels className="flex-1 overflow-hidden">
        {tabs.map((tab, index) => (
          <TabPanel key={index} className="h-full overflow-y-auto">
            {tab.content}
          </TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  )
}

// Individual exports for more flexible usage
export { Tab, TabGroup, TabList, TabPanel, TabPanels }
