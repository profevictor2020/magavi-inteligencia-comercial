"""Curated Chilean regions and principal cities/communes for territory setup."""

import unicodedata


REGIONS = (
    ("Arica y Parinacota", ("Arica", "Putre")),
    ("Tarapacá", ("Iquique", "Alto Hospicio", "Pozo Almonte")),
    ("Antofagasta", ("Antofagasta", "Calama", "Tocopilla", "Mejillones")),
    ("Atacama", ("Copiapó", "Vallenar", "Caldera", "Chañaral")),
    ("Coquimbo", ("La Serena", "Coquimbo", "Ovalle", "Illapel", "Los Vilos")),
    ("Valparaíso", ("Valparaíso", "Viña del Mar", "Quilpué", "Villa Alemana", "San Antonio", "Quillota", "Los Andes")),
    ("Metropolitana de Santiago", ("Santiago", "Providencia", "Ñuñoa", "Las Condes", "La Florida", "Puente Alto", "Maipú", "San Bernardo", "Quilicura")),
    ("O'Higgins", ("Rancagua", "Machalí", "San Fernando", "Rengo", "Santa Cruz", "Pichilemu")),
    ("Maule", ("Talca", "Curicó", "Linares", "Constitución", "Cauquenes")),
    ("Ñuble", ("Chillán", "Chillán Viejo", "San Carlos", "Bulnes")),
    ("Biobío", ("Concepción", "Talcahuano", "San Pedro de la Paz", "Los Ángeles", "Coronel", "Chiguayante")),
    ("La Araucanía", ("Temuco", "Padre Las Casas", "Angol", "Villarrica", "Pucón")),
    ("Los Ríos", ("Valdivia", "La Unión", "Río Bueno", "Panguipulli")),
    ("Los Lagos", ("Puerto Montt", "Puerto Varas", "Osorno", "Castro", "Ancud", "Quellón")),
    ("Aysén", ("Coyhaique", "Puerto Aysén", "Chile Chico", "Cochrane")),
    ("Magallanes y la Antártica Chilena", ("Punta Arenas", "Puerto Natales", "Porvenir", "Puerto Williams")),
)


def normalized_location(value):
    text = unicodedata.normalize("NFKD", str(value or "").casefold().strip())
    return " ".join("".join(char for char in text if not unicodedata.combining(char)).split())


def suggested_localities(region):
    key = normalized_location(region)
    return list(next((localities for name, localities in REGIONS if normalized_location(name) == key), ()))
