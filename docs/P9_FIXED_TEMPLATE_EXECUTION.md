# P9 Legacy Template Compatibility

## Current Rule

`fixed-business-template` is a compatibility input, not a page renderer. New pages are composed from independently editable CMS components and are persisted as P9 DSL.

```text
Legacy fixed template
  -> expandLegacyCmsTemplate()
  -> editable component composition
  -> P9 DSL meta.editorComponents
  -> Render Governor validation
  -> platform visual renderer
```

There is no `FixedBusinessTemplateRenderer.vue` and no whole-page template branch in `PageRenderer.vue`.

## Compatibility

Historical template keys are normalized from top-level `templateKey`, `props.templateKey`, or `config.templateKey`. They expand to one of the shared compositions in `packages/shared/src/cms-compositions.ts`:

- `home`
- `schedule`
- `registration`
- `member-center`
- `mall`
- `cart`

After expansion every module can be selected, configured, reordered, duplicated, hidden, or deleted in the visual editor. Saving writes the expanded P9 DSL, so an old page is not forced back into a locked template.

## Runtime Boundary

User rendering remains:

```text
PageRenderer
  -> Render Governor
  -> Runtime
  -> CmsVisualRenderer when validated DSL contains editorComponents
  -> DS RenderTree otherwise
```

The user runtime never reads `version.components` as its primary source. Existing pages without legacy templates continue to render unchanged.
