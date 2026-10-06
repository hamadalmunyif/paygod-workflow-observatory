# Boundary Contract

```text
ACP CLI / backend
      |
      | JSON observation
      v
Workflow Observatory (this package)
      |
      | normalized descriptor/instance
      v
Later internal consumers
```

The observatory owns only normalization and provenance labeling.

It does not own:

- external capability truth
- workflow execution
- economic authority
- signing authority
- policy decisions
- correctness of deliverables
- trusted time
- independent authenticity

Any later PayGod integration must consume the normalized object as evidence input, not treat it as authority merely because it came through this observatory.
