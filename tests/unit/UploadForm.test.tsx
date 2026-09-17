// @vitest-environment jsdom
//
// Regression test for issue #8: "Upload flow reports success even when it
// silently failed".
//
// savePdfSegments() and createBlobFile() always resolve to an object
// ({ success: true, data } or { success: false, error }), never to
// null/undefined. The `if (!segments)` / `if (!blobFileDetail)` checks in
// UploadForm's onSubmit therefore never fire, and a failed save falls
// through to `form.reset(); router.push("/")` as if it succeeded.
//
// These tests exercise the real submit flow (not just the isolated
// condition) so they fail against the current buggy code and pass once
// the checks are changed to `if (!segments.success)` / `if (!blobFileDetail.success)`.
//
// Requires (add as devDependencies if not already present):
//   @testing-library/react
//   @testing-library/user-event
//   jsdom
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UploadForm from "@/components/UploadForm";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ userId: "test-user" }),
}));

const toastErrorMock = vi.fn();
const toastInfoMock = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    info: (...args: unknown[]) => toastInfoMock(...args),
  },
}));

// Keep real exports (cn, generateSlug, etc.) but replace parsePDFFile so the
// test never touches pdfjs-dist / canvas.
vi.mock("@/lib/utils", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/utils")>();
  return {
    ...actual,
    parsePDFFile: vi.fn().mockResolvedValue({
      content: [
        {
          text: "hello world",
          segmentIndex: 0,
          wordCount: 2,
        },
      ],
      cover: "data:image/png;base64,AAAA",
    }),
  };
});

vi.mock("@vercel/blob/client", () => ({
  upload: vi.fn().mockResolvedValue({
    url: "https://blob.example.com/file.pdf",
    pathname: "users/test-user/file.pdf",
  }),
}));

const checkPdfExistsMock = vi.fn();
const createPdfMock = vi.fn();
const savePdfSegmentsMock = vi.fn();
const createBlobFileMock = vi.fn();

vi.mock("@/lib/action/pdf.actions", () => ({
  checkPdfExists: (...args: unknown[]) =>
    checkPdfExistsMock(...args),
  createPdf: (...args: unknown[]) => createPdfMock(...args),
  savePdfSegments: (...args: unknown[]) =>
    savePdfSegmentsMock(...args),
  createBlobFile: (...args: unknown[]) =>
    createBlobFileMock(...args),
}));

// VoiceSelector wraps @base-ui/react's RadioGroup, which can need extra
// jsdom polyfills (PointerEvent, ResizeObserver) unrelated to this bug.
// Swap it for a plain control that still calls onChange like the real one.
vi.mock("@/components/VoiceSelector", () => ({
  default: (props: {
    onChange: (voiceId: string) => void;
  }) => (
    <button
      type="button"
      data-testid="voice-select"
      onClick={() => props.onChange("rachel")}
    >
      Select Voice
    </button>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePdfFile() {
  return new File(["%PDF-1.4 fake content"], "book.pdf", {
    type: "application/pdf",
  });
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  container: HTMLElement,
) {
  // FileUploader is real (plain hidden <input type="file">), so grab it
  // directly. It's the first of the two file inputs rendered by the form.
  const [pdfInput] = Array.from(
    container.querySelectorAll('input[type="file"]'),
  ) as HTMLInputElement[];

  await user.upload(pdfInput, makePdfFile());
  await user.type(
    screen.getByPlaceholderText("ex: Clean Code"),
    "Clean Code",
  );
  await user.type(
    screen.getByPlaceholderText("ex: Robert C Martin"),
    "Robert C Martin",
  );
  await user.click(screen.getByTestId("voice-select"));
  await user.click(
    screen.getByRole("button", {
      name: /begin synthesis/i,
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("UploadForm submit flow", () => {
  // RTL's automatic cleanup only self-registers when `afterEach` exists as
  // a real global (i.e. `globals: true` in vitest.config.ts). Since this
  // file imports its test globals explicitly, register cleanup by hand so
  // each test starts from an unmounted DOM instead of stacking renders.
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();

    checkPdfExistsMock.mockResolvedValue({
      success: true,
      data: null,
      alreadyExists: false,
    });
    createPdfMock.mockResolvedValue({
      success: true,
      data: { _id: "pdf-id-1", title: "Clean Code" },
    });

    // Covers both the cover-image data-URL fetch and the /api/blob-orphaned
    // cleanup DELETE that fires when an already-uploaded blob needs removal.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
      blob: () => Promise.resolve(new Blob(["cover"])),
    } as unknown as Response);
  });

  it("redirects home on a genuinely successful upload", async () => {
    savePdfSegmentsMock.mockResolvedValue({
      success: true,
      data: { segmentsCreated: 1 },
    });
    createBlobFileMock.mockResolvedValue({
      success: true,
      data: { _id: "blob-id-1" },
    });

    const user = userEvent.setup();
    const { container } = render(<UploadForm />);
    await fillAndSubmit(user, container);

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/"),
    );
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("does not report success when savePdfSegments fails", async () => {
    savePdfSegmentsMock.mockResolvedValue({
      success: false,
      error: "Database write failed",
    });
    createBlobFileMock.mockResolvedValue({
      success: true,
      data: { _id: "blob-id-1" },
    });

    const user = userEvent.setup();
    const { container } = render(<UploadForm />);
    await fillAndSubmit(user, container);

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalled(),
    );
    expect(pushMock).not.toHaveBeenCalledWith("/");
  });

  it("does not report success when createBlobFile fails", async () => {
    savePdfSegmentsMock.mockResolvedValue({
      success: true,
      data: { segmentsCreated: 1 },
    });
    createBlobFileMock.mockResolvedValue({
      success: false,
      error: "Failed to persist blob metadata",
    });

    const user = userEvent.setup();
    const { container } = render(<UploadForm />);
    await fillAndSubmit(user, container);

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalled(),
    );
    expect(pushMock).not.toHaveBeenCalledWith("/");
  });
});
