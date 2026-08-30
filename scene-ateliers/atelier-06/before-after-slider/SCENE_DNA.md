# Scene DNA — Before / After

## Identity kernel

One frame. Two registered sources. One scalar divider truth.

## Silhouette

- one stable rectangular comparison frame;
- one vertical divider spanning the content rectangle;
- one compact handle;
- optional opposing side labels;
- no separated cards, depth stack, or carousel track.

If the divider disappears, the Scene becomes an ordinary image frame. If two card silhouettes appear, the Scene has failed.

## Spatial grammar

| Axis | Rule |
| --- | --- |
| Content rectangle | exactly shared by both panes |
| Source order | index 0 before, index 1 after |
| Clip | before pane clipped at scalar split; after pane remains complete beneath |
| Fit | identical contain/cover policy and centred alignment |
| Depth | after base, before clip, labels, divider, interactive slider |
| Recomposition | frame scales to canvas; split remains normalized horizontal fraction |

## Temporal grammar

- holds are first-class states, not low-velocity approximations;
- every turnaround reaches zero velocity;
- forward and reverse use one path;
- start and end match exactly;
- manual state bypasses automatic time without bypassing evaluator;
- no decorative handle pulse.

## Source honesty

Side identity is stronger than decode success. A failed pane cannot reveal the opposite source under the wrong label. Extra media is preserved but not consumed. One source never becomes a fake pair.

## Anti-patterns

- crossfade;
- two-frame carousel;
- duplicating one source;
- independent source rectangles or crop origins;
- CSS transition after evaluator output;
- pointer inertia;
- label swapping in reverse;
- transparent export without defined semantics.

## Neighbour distinction

This Scene compares simultaneous spatial registration. A carousel compares sequential selection. A wipe transition replaces one image with another for spectacle; Before / After keeps both identities continuously inspectable and manually addressable.

## Deletion test

Deleting this prototype affects no other Scene. No shared comparison engine, phase engine, schema extension, or Product renderer is introduced.
