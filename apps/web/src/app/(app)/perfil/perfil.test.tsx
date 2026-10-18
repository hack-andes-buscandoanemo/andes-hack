import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const profilePhotoApi = vi.hoisted(() => ({
  getMyProfilePhoto: vi.fn(),
  uploadProfilePhoto: vi.fn(),
  confirmProfilePhoto: vi.fn(),
  deleteMyProfilePhoto: vi.fn(),
}));

import { serverError } from "@/test/server-error";

const push = vi.fn();
const signOut = vi.fn();
const updateTravelPreferences = vi.fn();
const getMyImpact = vi.fn();
const listVehicles = vi.fn();
const updateMembership = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: (...args: unknown[]) => signOut(...args) },
}));
vi.mock("@/lib/communities-api", () => ({
  communitiesApi: {
    updateTravelPreferences: (...args: unknown[]) => updateTravelPreferences(...args),
    getMyImpact: (...args: unknown[]) => getMyImpact(...args),
    listVehicles: (...args: unknown[]) => listVehicles(...args),
    updateMembership: (...args: unknown[]) => updateMembership(...args),
    ...profilePhotoApi,
  },
}));

import Perfil from "./perfil";

const COMMUNITY_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  push.mockClear();
  signOut.mockReset();
  updateTravelPreferences.mockReset();
  profilePhotoApi.getMyProfilePhoto.mockReset().mockResolvedValue({ photoUrl: null });
  profilePhotoApi.uploadProfilePhoto.mockReset();
  profilePhotoApi.confirmProfilePhoto.mockReset();
  profilePhotoApi.deleteMyProfilePhoto.mockReset();
  getMyImpact.mockReset().mockReturnValue(new Promise(() => {}));
  listVehicles.mockReset().mockResolvedValue([]);
  updateMembership.mockReset();
});

const MEMBERSHIP = {
  communityId: COMMUNITY_ID,
  communityName: "Comunidad Alfa",
  alias: "Ana T.",
  verificationMethod: "join_code" as const,
  usualMode: "drove_alone" as const,
  travelRole: "passenger" as const,
};

describe("perfil: cabecera (US-035)", () => {
  it("shows the alias, the community and how the membership was verified", () => {
    render(<Perfil name="Ana Torres" email="ana@alfa.pe" membership={MEMBERSHIP} />);

    expect(screen.getByText("Ana T.")).toBeInTheDocument();
    expect(screen.getByText("Comunidad Alfa")).toBeInTheDocument();
    expect(screen.getByText("Miembro verificado · Código de acceso")).toBeInTheDocument();
    expect(screen.getByText("Perfil completo 100 %")).toBeInTheDocument();
  });

  it("counts the vehicle in the completeness of someone who drives", async () => {
    render(
      <Perfil
        name="Carlos Quispe"
        email="carlos@alfa.pe"
        membership={{ ...MEMBERSHIP, travelRole: "both" }}
      />,
    );

    expect(await screen.findByText("Perfil completo 75 %")).toBeInTheDocument();
  });
});

describe("perfil: seguridad (US-035)", () => {
  it("shows the validated membership and the vehicle as declared, never as verified", async () => {
    listVehicles.mockResolvedValue([
      { id: "v-1", plate: "ABC-123", make: "Toyota", model: "Yaris", color: "Gris", seats: 4 },
    ]);
    render(
      <Perfil
        name="Carlos Quispe"
        email="carlos@alfa.pe"
        membership={{ ...MEMBERSHIP, travelRole: "driver" }}
      />,
    );

    const security = screen.getByRole("region", { name: "Seguridad" });
    expect(within(security).getByText("Pertenencia validada")).toBeInTheDocument();
    expect(await within(security).findByText("Vehículo registrado: Declarado")).toBeInTheDocument();
    expect(within(security).getByRole("link", { name: "Historial de viajes" })).toHaveAttribute(
      "href",
      "/viajes?tab=historial",
    );
    expect(screen.queryByText(/Verificado$/)).not.toBeInTheDocument();
    expect(screen.queryByText("Documento validado")).not.toBeInTheDocument();
    expect(screen.queryByText("Métodos de pago")).not.toBeInTheDocument();
    expect(screen.queryByText(/Notificaciones/)).not.toBeInTheDocument();
  });
});

describe("perfil: contactos de emergencia (US-028)", () => {
  it("sends the passenger to their trips, where an accepted trip can be shared", () => {
    render(<Perfil name="Ana Torres" email="ana@alfa.pe" membership={MEMBERSHIP} />);

    const security = screen.getByRole("region", { name: "Seguridad" });
    expect(within(security).getByRole("link", { name: "Contactos de emergencia" })).toHaveAttribute(
      "href",
      "/viajes?role=pasajero",
    );
    expect(
      within(security).getByText(
        "Comparte el enlace de un viaje aceptado con alguien de confianza.",
      ),
    ).toBeInTheDocument();
  });
});

describe("perfil: editar perfil (US-035)", () => {
  it("saves the alias and the usual mode without asking for consent again", async () => {
    updateMembership.mockResolvedValue({});
    render(<Perfil name="Ana Torres" email="ana@alfa.pe" membership={MEMBERSHIP} />);
    const user = userEvent.setup();

    const edit = screen.getByRole("region", { name: "Editar perfil" });
    await user.clear(within(edit).getByLabelText("Nombre visible"));
    await user.type(within(edit).getByLabelText("Nombre visible"), "Anita");
    await user.selectOptions(
      within(edit).getByLabelText("Modo habitual"),
      "En transporte público (bus, corredor, tren, Metropolitano, colectivo)",
    );
    await user.click(within(edit).getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("Cambios guardados.")).toBeInTheDocument();
    expect(updateMembership).toHaveBeenCalledWith(COMMUNITY_ID, {
      alias: "Anita",
      usualMode: "public_transport",
    });
    expect(screen.getByText("Anita")).toBeInTheDocument();
  });

  it("says the changes could not be saved and keeps the previous alias", async () => {
    updateMembership.mockRejectedValue(serverError(500, "Ocurrió un error inesperado."));
    render(<Perfil name="Ana Torres" email="ana@alfa.pe" membership={MEMBERSHIP} />);
    const user = userEvent.setup();

    const edit = screen.getByRole("region", { name: "Editar perfil" });
    await user.clear(within(edit).getByLabelText("Nombre visible"));
    await user.type(within(edit).getByLabelText("Nombre visible"), "Anita");
    await user.click(within(edit).getByRole("button", { name: "Guardar cambios" }));

    expect(
      await screen.findByText("No pudimos guardar tus cambios. Inténtalo de nuevo."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
    expect(screen.getByText("Ana T.")).toBeInTheDocument();
  });
});

describe("perfil: centro de ayuda (US-035)", () => {
  it("answers why the app does not charge", async () => {
    render(<Perfil name="Ana Torres" email="ana@alfa.pe" membership={MEMBERSHIP} />);

    const help = screen.getByRole("region", { name: "Centro de ayuda" });
    await userEvent.setup().click(within(help).getByText("¿Por qué Te Jalo no cobra?"));

    expect(
      within(help).getByText(
        "Te Jalo no procesa pagos ni cobra comisión. Quienes viajan comparten el gasto de combustible con quien maneja, sin ganancia comercial.",
      ),
    ).toBeVisible();
  });
});

describe("perfil: mi impacto (US-035)", () => {
  it("shows three shared trips and three car trips avoided, with the CO₂ marked as estimated", async () => {
    getMyImpact.mockResolvedValue({
      sharedTrips: 3,
      carTripsAvoided: 3,
      co2Kg: 9.74,
      fromPublicTransport: 0,
    });
    render(<Perfil name="Ana Torres" email="ana@alfa.pe" membership={MEMBERSHIP} />);

    const impact = await screen.findByRole("region", { name: "Mi impacto" });
    expect(await within(impact).findByText("Viajes compartidos")).toBeInTheDocument();
    expect(within(impact).getByText("Viajes compartidos").nextSibling).toHaveTextContent("3");
    expect(within(impact).getByText("Viajes en auto evitados").nextSibling).toHaveTextContent("3");
    expect(within(impact).getByText("CO₂ evitado (estimado)").nextSibling).toHaveTextContent(
      "9,7 kg",
    );
    expect(getMyImpact).toHaveBeenCalledWith(COMMUNITY_ID);
    expect(
      within(impact).queryByText("Mejoraste tu viaje; no cuenta como auto evitado"),
    ).not.toBeInTheDocument();
  });

  it("explains to a passenger who came by bus that the trip does not count as a car avoided", async () => {
    getMyImpact.mockResolvedValue({
      sharedTrips: 3,
      carTripsAvoided: 0,
      co2Kg: 0,
      fromPublicTransport: 3,
    });
    render(<Perfil name="Rosa Huamán" email="rosa@alfa.pe" membership={MEMBERSHIP} />);

    const impact = await screen.findByRole("region", { name: "Mi impacto" });
    expect(await within(impact).findByText("Viajes compartidos")).toBeInTheDocument();
    expect(within(impact).getByText("Viajes compartidos").nextSibling).toHaveTextContent("3");
    expect(within(impact).getByText("Viajes en auto evitados").nextSibling).toHaveTextContent("0");
    expect(
      within(impact).getByText("Mejoraste tu viaje; no cuenta como auto evitado"),
    ).toBeInTheDocument();
  });
});

describe("perfil: mi impacto sin conexión (US-035)", () => {
  it("says the impact could not be loaded instead of leaving the section empty", async () => {
    getMyImpact.mockRejectedValue(serverError(500, "Ocurrió un error inesperado."));
    render(<Perfil name="Ana Torres" email="ana@alfa.pe" membership={MEMBERSHIP} />);

    const impact = screen.getByRole("region", { name: "Mi impacto" });
    expect(
      await within(impact).findByText("No pudimos cargar tu impacto. Inténtalo de nuevo."),
    ).toBeInTheDocument();
  });
});

describe("perfil: preferencias de viaje (US-026)", () => {
  it("turns on Solo mujeres for a woman who already declared it and confirms it", async () => {
    updateTravelPreferences.mockResolvedValue({
      identifiesAsWoman: true,
      womenOnly: true,
      message: "Preferencia guardada.",
    });
    render(
      <Perfil
        name="Lucía"
        email="lucia@alfa.pe"
        preferences={{ communityId: COMMUNITY_ID, identifiesAsWoman: true, womenOnly: false }}
      />,
    );

    await userEvent.setup().click(screen.getByRole("switch", { name: "Solo mujeres" }));

    expect(await screen.findByText("Preferencia guardada.")).toBeInTheDocument();
    expect(updateTravelPreferences).toHaveBeenCalledWith(COMMUNITY_ID, {
      identifiesAsWoman: true,
      womenOnly: true,
    });
    expect(screen.getByRole("switch", { name: "Solo mujeres" })).toBeChecked();
  });

  it("asks for the declaration before turning on Solo mujeres, and saves nothing", async () => {
    render(
      <Perfil
        name="Lucía"
        email="lucia@alfa.pe"
        preferences={{ communityId: COMMUNITY_ID, identifiesAsWoman: false, womenOnly: false }}
      />,
    );

    await userEvent.setup().click(screen.getByRole("switch", { name: "Solo mujeres" }));

    expect(
      screen.getByText('Para usar "Solo mujeres", confirma que te identificas como mujer.'),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Solo mujeres" })).not.toBeChecked();
    expect(updateTravelPreferences).not.toHaveBeenCalled();
  });

  it("saves the declaration, explaining that only matching uses it", async () => {
    updateTravelPreferences.mockResolvedValue({
      identifiesAsWoman: true,
      womenOnly: false,
      message: "Preferencia guardada.",
    });
    render(
      <Perfil
        name="Lucía"
        email="lucia@alfa.pe"
        preferences={{ communityId: COMMUNITY_ID, identifiesAsWoman: false, womenOnly: false }}
      />,
    );

    expect(screen.getByText("Preferencia opcional")).toBeInTheDocument();
    expect(screen.getByText("Solo se usa para emparejarte; nadie más la ve")).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("checkbox", { name: "Me identifico como mujer" }));

    expect(await screen.findByText("Preferencia guardada.")).toBeInTheDocument();
    expect(updateTravelPreferences).toHaveBeenCalledWith(COMMUNITY_ID, {
      identifiesAsWoman: true,
      womenOnly: false,
    });
    expect(screen.getByRole("checkbox", { name: "Me identifico como mujer" })).toBeChecked();
  });

  it("turns Solo mujeres off too when the declaration is withdrawn", async () => {
    updateTravelPreferences.mockResolvedValue({
      identifiesAsWoman: false,
      womenOnly: false,
      message: "Preferencia guardada.",
    });
    render(
      <Perfil
        name="Lucía"
        email="lucia@alfa.pe"
        preferences={{ communityId: COMMUNITY_ID, identifiesAsWoman: true, womenOnly: true }}
      />,
    );

    await userEvent
      .setup()
      .click(screen.getByRole("checkbox", { name: "Me identifico como mujer" }));

    expect(await screen.findByText("Preferencia guardada.")).toBeInTheDocument();
    expect(updateTravelPreferences).toHaveBeenCalledWith(COMMUNITY_ID, {
      identifiesAsWoman: false,
      womenOnly: false,
    });
    expect(screen.getByRole("switch", { name: "Solo mujeres" })).not.toBeChecked();
  });

  it("shows why the preference could not be saved and keeps the previous one", async () => {
    updateTravelPreferences.mockRejectedValue(serverError(403, "No perteneces a esta comunidad."));
    render(
      <Perfil
        name="Lucía"
        email="lucia@alfa.pe"
        preferences={{ communityId: COMMUNITY_ID, identifiesAsWoman: true, womenOnly: false }}
      />,
    );

    await userEvent.setup().click(screen.getByRole("switch", { name: "Solo mujeres" }));

    expect(await screen.findByText("No perteneces a esta comunidad.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Solo mujeres" })).not.toBeChecked();
  });
});

describe("perfil: rutas recurrentes (US-035)", () => {
  it("links the travel preferences to the saved routes", () => {
    render(
      <Perfil
        name="Lucía"
        email="lucia@alfa.pe"
        preferences={{ communityId: COMMUNITY_ID, identifiesAsWoman: false, womenOnly: false }}
      />,
    );

    const preferences = screen.getByRole("region", { name: "Preferencias de viaje" });
    expect(within(preferences).getByRole("link", { name: "Rutas recurrentes" })).toHaveAttribute(
      "href",
      "/viajes",
    );
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("perfil", () => {
  it("shows the account name and email", () => {
    render(<Perfil name="Ana" email="ana@uni.pe" />);

    expect(screen.getByRole("heading", { level: 1, name: "Perfil" })).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("ana@uni.pe")).toBeInTheDocument();
  });

  it("offers community administration, with the matching screen, only to administrators", () => {
    const { rerender } = render(<Perfil name="Ana" email="ana@uni.pe" role="admin" />);

    const admin = screen.getByRole("region", { name: "Administrar comunidad" });
    expect(within(admin).getByRole("link", { name: "Emparejamiento" })).toHaveAttribute(
      "href",
      "/comunidad/emparejamiento",
    );

    rerender(<Perfil name="Ana" email="ana@uni.pe" role="member" />);
    expect(screen.queryByText("Administrar comunidad")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Emparejamiento" })).not.toBeInTheDocument();
  });

  it("signs out and returns to the welcome screen", async () => {
    signOut.mockResolvedValue({});
    render(<Perfil name="Ana" email="ana@uni.pe" />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(signOut).toHaveBeenCalled();
  });

  it("links to the privacy settings (US-029)", () => {
    render(<Perfil name="Ana" email="ana@uni.pe" />);

    expect(screen.getByRole("link", { name: "Privacidad" })).toHaveAttribute(
      "href",
      "/perfil/privacidad",
    );
  });

  it("links to the trip history", () => {
    render(<Perfil name="Ana" email="ana@uni.pe" />);

    expect(screen.getByRole("link", { name: "Historial de viajes" })).toHaveAttribute(
      "href",
      "/viajes?tab=historial",
    );
  });

  it("shows initials until the staged photo is confirmed", async () => {
    const user = userEvent.setup();
    const uploadFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", uploadFetch);
    profilePhotoApi.uploadProfilePhoto.mockResolvedValue({
      key: "profile-photos/ana/123.jpg",
      uploadUrl: "https://r2.example/upload",
      expiresIn: 300,
    });
    profilePhotoApi.confirmProfilePhoto.mockResolvedValue({
      photoUrl: "https://r2.example/photo?signature=read",
    });
    render(<Perfil name="Ana" email="ana@uni.pe" />);

    expect(await screen.findByRole("img", { name: "Iniciales de Ana" })).toBeInTheDocument();
    await user.upload(
      screen.getByLabelText("Cambiar foto"),
      new File(["photo"], "ana.png", { type: "image/png" }),
    );

    expect(await screen.findByRole("img", { name: "Foto de Ana" })).toHaveAttribute(
      "src",
      "https://r2.example/photo?signature=read",
    );
    expect(profilePhotoApi.uploadProfilePhoto).toHaveBeenCalledWith({
      contentType: "image/png",
      size: 5,
    });
    expect(uploadFetch).toHaveBeenCalledWith("https://r2.example/upload", {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: expect.any(File),
    });
    expect(profilePhotoApi.confirmProfilePhoto).toHaveBeenCalledWith("profile-photos/ana/123.jpg");
  });

  it("rejects an unsupported file with the allowed formats and size", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<Perfil name="Ana" email="ana@uni.pe" />);

    await user.upload(
      screen.getByLabelText("Cambiar foto"),
      new File(["pdf"], "ana.pdf", { type: "application/pdf" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Usa una imagen JPG, PNG o WebP de hasta 2 MB.",
    );
    expect(profilePhotoApi.uploadProfilePhoto).not.toHaveBeenCalled();
  });

  it("keeps the current photo and shows a retry message when upload fails", async () => {
    const user = userEvent.setup();
    profilePhotoApi.getMyProfilePhoto.mockResolvedValue({
      photoUrl: "https://r2.example/current.jpg?signature=read",
    });
    profilePhotoApi.uploadProfilePhoto.mockRejectedValue(new Error("offline"));
    render(<Perfil name="Ana" email="ana@uni.pe" />);

    expect(await screen.findByRole("img", { name: "Foto de Ana" })).toHaveAttribute(
      "src",
      "https://r2.example/current.jpg?signature=read",
    );
    await user.upload(
      screen.getByLabelText("Cambiar foto"),
      new File(["photo"], "ana.png", { type: "image/png" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos subir tu foto. Inténtalo de nuevo.",
    );
    expect(screen.getByRole("img", { name: "Foto de Ana" })).toHaveAttribute(
      "src",
      "https://r2.example/current.jpg?signature=read",
    );
  });

  it("removes a photo and returns to the initials avatar", async () => {
    const user = userEvent.setup();
    profilePhotoApi.getMyProfilePhoto.mockResolvedValue({
      photoUrl: "https://r2.example/current.jpg?signature=read",
    });
    profilePhotoApi.deleteMyProfilePhoto.mockResolvedValue({ message: "Foto eliminada." });
    render(<Perfil name="Ana" email="ana@uni.pe" />);

    await user.click(await screen.findByRole("button", { name: "Quitar foto" }));

    expect(profilePhotoApi.deleteMyProfilePhoto).toHaveBeenCalledOnce();
    expect(await screen.findByRole("img", { name: "Iniciales de Ana" })).toBeInTheDocument();
  });

  it("falls back to initials when a signed photo URL expires", async () => {
    profilePhotoApi.getMyProfilePhoto.mockResolvedValue({
      photoUrl: "https://r2.example/expired.jpg?signature=old",
    });
    render(<Perfil name="Ana" email="ana@uni.pe" />);

    const photo = await screen.findByRole("img", { name: "Foto de Ana" });
    fireEvent.error(photo);

    expect(await screen.findByRole("img", { name: "Iniciales de Ana" })).toBeInTheDocument();
  });
});
