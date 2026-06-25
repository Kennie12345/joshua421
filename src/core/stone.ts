/**
 * A Stone is a record of consistent effort over time — behaviour, never content.
 * The growing pile of Stones is the cairn you look back over: "look how faithful
 * God has been." We store that you showed up; never what you wrote.
 */
export type StoneKind = 'before' | 'after' | 'look-back'

export type StoneStatus = 'shown-up' | 'skipped'

export interface Stone {
  id: string
  /** ISO date (YYYY-MM-DD, local day) the stone belongs to. */
  date: string
  kind: StoneKind
  status: StoneStatus
  /** Optional opaque reference to the source event — an id only, never content. */
  eventRef?: string
}

/**
 * A Reflection is the words offered in the moment. It is TRANSIENT: shown to the
 * person, then discarded. It is never written to the cairn.
 */
export interface Reflection {
  kind: StoneKind
  text: string
}
